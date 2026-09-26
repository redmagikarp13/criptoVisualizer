pub mod types;
pub mod binance;
pub mod okx;
pub mod bybit;
pub mod http;

use crate::{error::{AppError, Result}, preferences::{valid_symbol, valid_interval}};
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;
use types::{MarketRequest, Sink};

#[derive(Default)]
pub struct MarketHub { current: Mutex<Option<(String, CancellationToken)>> }
impl MarketHub {
    pub fn start(&self, client: reqwest::Client, request: MarketRequest, sink: Sink) -> Result<()> {
        if request.id.len() > 100 || !valid_symbol(&request.symbol) || !valid_interval(&request.interval)
            || request.favorites.len() > 20 || request.favorites.iter().any(|s| !valid_symbol(s)) {
            return Err(AppError::new("invalid_market", "Seleção de mercado inválida."));
        }
        let mut current = self.current.lock().map_err(|_| AppError::new("internal", "Falha ao abrir mercado."))?;
        if let Some((_, token)) = current.take() { token.cancel(); }
        let token = CancellationToken::new();
        *current = Some((request.id.clone(), token.clone()));
        tauri::async_runtime::spawn(binance::run(client.clone(), request.clone(), sink.clone(), token.clone()));
        tauri::async_runtime::spawn(okx::run(client.clone(), request.clone(), sink.clone(), token.clone()));
        tauri::async_runtime::spawn(bybit::run(client, request, sink, token));
        Ok(())
    }
    pub fn stop(&self, id: Option<&str>) {
        if let Ok(mut current) = self.current.lock() {
            if current.as_ref().is_some_and(|(active, _)| id.is_none() || id == Some(active.as_str())) {
                if let Some((_, token)) = current.take() { token.cancel(); }
            }
        }
    }
}
impl Drop for MarketHub { fn drop(&mut self) { self.stop(None); } }
