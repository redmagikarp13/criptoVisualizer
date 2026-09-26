use super::{types::*};
use crate::error::{now_ms, AppError, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_util::sync::CancellationToken;

// Bybit Spot usa o mesmo símbolo concatenado da Binance (ex.: BTCUSDT, BTCUSDC).
pub fn parse_ticker(value: &Value, symbol: &str, received: u64) -> Option<Quote> {
    if value["topic"].as_str()? != format!("tickers.{symbol}") { return None; }
    let data = &value["data"];
    if data["symbol"].as_str()? != symbol { return None; }
    let price = number(&data["lastPrice"])?;
    if price <= 0.0 { return None; }
    let change_24h = number(&data["price24hPcnt"]).unwrap_or(0.0) * 100.0;
    Some(Quote { symbol: symbol.into(), price, change_24h,
        time: value["ts"].as_u64()?, received_at: received, exchange: "bybit".into() })
}
async fn session(client: &reqwest::Client, symbol: &str, sink: &Sink) -> Result<()> {
    let _ = client; // assinatura pública, sem listagem prévia
    let (mut socket, _) = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async("wss://stream.bybit.com/v5/public/spot")).await
        .map_err(|_| AppError::new("network", "Tempo esgotado ao conectar à Bybit."))?
        .map_err(|_| AppError::new("network", "Comparação indisponível: conexão Bybit falhou."))?;
    socket.send(WsMessage::Text(json!({"op":"subscribe","args":[format!("tickers.{symbol}")]}).to_string().into())).await
        .map_err(|_| AppError::new("network", "Assinatura Bybit interrompida."))?;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_message = Instant::now();
    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if last_message.elapsed() > Duration::from_secs(45) { return Err(AppError::new("network", "Bybit sem resposta ao heartbeat.")); }
                socket.send(WsMessage::Text(json!({"op":"ping"}).to_string().into())).await.map_err(|_| AppError::new("network", "Conexão Bybit interrompida."))?;
            }
            message = socket.next() => {
                match message {
                    Some(Ok(WsMessage::Text(text))) => {
                        last_message = Instant::now();
                        let value: Value = serde_json::from_str(&text).map_err(|_| AppError::new("invalid_data", "Mensagem Bybit inválida."))?;
                        if value["op"] == "success" || value["ret_msg"] == "pong" || value["op"] == "pong" { continue; }
                        if value["success"].as_bool() == Some(false) { return Err(AppError::new("exchange_unavailable", "A Bybit recusou a assinatura deste instrumento.")); }
                        if let Some(quote) = parse_ticker(&value, symbol, now_ms()) {
                            status(sink, "bybit", "connected", "Bybit Spot conectada");
                            sink(Event::Quote { quote });
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => { socket.send(WsMessage::Pong(data)).await.map_err(|_| AppError::new("network", "Conexão Bybit interrompida."))?; }
                    Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => return Err(AppError::new("network", "Conexão Bybit interrompida.")),
                    _ => {}
                }
            }
        }
    }
}
pub async fn run(client: reqwest::Client, request: MarketRequest, sink: Sink, cancel: CancellationToken) {
    let mut attempt = 0u32;
    loop {
        status(&sink, "bybit", if attempt == 0 { "connecting" } else { "reconnecting" }, "Conectando à Bybit…");
        let started = Instant::now();
        let result = tokio::select! { _ = cancel.cancelled() => return, result = session(&client, &request.symbol, &sink) => result };
        if let Err(error) = result { status(&sink, "bybit", "error", &error.message); }
        if started.elapsed() > Duration::from_secs(60) { attempt = 0; }
        let delay = (1u64 << attempt.min(5)) as f64 + rand::random::<f64>();
        attempt += 1;
        tokio::select! { _ = cancel.cancelled() => return, _ = tokio::time::sleep(Duration::from_secs_f64(delay)) => {} }
    }
}
