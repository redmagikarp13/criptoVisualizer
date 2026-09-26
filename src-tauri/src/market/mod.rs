pub mod types;
pub mod binance;
pub mod okx;
pub mod bybit;
pub mod http;
pub mod brapi;

use crate::{
    error::{AppError, Result},
    preferences::{is_b3_symbol, is_crypto_symbol, valid_interval, valid_symbol},
};
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

        if is_b3_symbol(&request.symbol) {
            tauri::async_runtime::spawn(run_b3(client, request, sink, token));
        } else {
            let mut crypto_request = request;
            crypto_request.favorites.retain(|s| is_crypto_symbol(s));
            tauri::async_runtime::spawn(binance::run(client.clone(), crypto_request.clone(), sink.clone(), token.clone()));
            tauri::async_runtime::spawn(okx::run(client.clone(), crypto_request.clone(), sink.clone(), token.clone()));
            tauri::async_runtime::spawn(bybit::run(client, crypto_request, sink, token));
        }
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

async fn run_b3(client: reqwest::Client, request: MarketRequest, sink: Sink, token: CancellationToken) {
    types::status(&sink, "binance", "connected", "B3 · brapi.dev");

    match brapi::fetch_stock_candles(&client, &request.symbol, None).await {
        Ok(candles) => {
            sink(types::Event::History { candles });
        }
        Err(err) => {
            types::status(&sink, "binance", "error", &err.to_string());
        }
    }

    let fetch_quote = |ticker: String, client: reqwest::Client, sink: Sink| async move {
        if let Ok(quotes) = brapi::fetch_quotes(&client, &[ticker], None).await {
            if let Some(q) = quotes.into_iter().next() {
                sink(types::Event::Quote {
                    quote: types::Quote {
                        symbol: q.ticker,
                        price: q.price,
                        change_24h: q.change,
                        time: q.updated_at,
                        received_at: q.updated_at,
                        exchange: "binance".into(),
                    },
                });
            }
        }
    };

    fetch_quote(request.symbol.clone(), client.clone(), sink.clone()).await;

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    interval.tick().await;
    loop {
        tokio::select! {
            _ = token.cancelled() => break,
            _ = interval.tick() => {
                fetch_quote(request.symbol.clone(), client.clone(), sink.clone()).await;
            }
        }
    }
}
