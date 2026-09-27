use super::{types::*};
use crate::error::{now_ms, AppError, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, PartialEq, PartialOrd)]
pub struct OrderedPrice(pub f64);

impl Eq for OrderedPrice {}
impl Ord for OrderedPrice {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(std::cmp::Ordering::Equal)
    }
}

pub fn parse_depth(
    value: &Value,
    symbol: &str,
    bids: &mut std::collections::BTreeMap<OrderedPrice, f64>,
    asks: &mut std::collections::BTreeMap<OrderedPrice, f64>,
    received: u64,
) -> Option<OrderBook> {
    if value["topic"].as_str()? != format!("orderbook.50.{symbol}") {
        return None;
    }
    let data = &value["data"];
    if data["s"].as_str()? != symbol {
        return None;
    }
    let msg_type = value["type"].as_str().unwrap_or("delta");
    if msg_type == "snapshot" {
        bids.clear();
        asks.clear();
    }

    let update_levels = |arr: &Value, map: &mut std::collections::BTreeMap<OrderedPrice, f64>| {
        if let Some(list) = arr.as_array() {
            for item in list {
                if let Some(row) = item.as_array() {
                    if row.len() >= 2 {
                        if let (Some(price), Some(amount)) = (number(&row[0]), number(&row[1])) {
                            if price > 0.0 {
                                if amount <= 0.0 {
                                    map.remove(&OrderedPrice(price));
                                } else {
                                    map.insert(OrderedPrice(price), amount);
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    update_levels(&data["b"], bids);
    update_levels(&data["a"], asks);

    if bids.is_empty() && asks.is_empty() {
        return None;
    }

    let bid_levels: Vec<DepthLevel> = bids
        .iter()
        .rev()
        .take(20)
        .map(|(p, &amount)| DepthLevel { price: p.0, amount })
        .collect();

    let ask_levels: Vec<DepthLevel> = asks
        .iter()
        .take(20)
        .map(|(p, &amount)| DepthLevel { price: p.0, amount })
        .collect();

    let time = value["ts"].as_u64().unwrap_or(received);

    Some(OrderBook {
        symbol: symbol.into(),
        bids: bid_levels,
        asks: ask_levels,
        time,
        exchange: Some("bybit".into()),
    })
}

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
    socket.send(WsMessage::Text(json!({
        "op": "subscribe",
        "args": [
            format!("tickers.{symbol}"),
            format!("orderbook.50.{symbol}")
        ]
    }).to_string().into())).await
        .map_err(|_| AppError::new("network", "Assinatura Bybit interrompida."))?;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_message = Instant::now();
    let mut bids_map = std::collections::BTreeMap::new();
    let mut asks_map = std::collections::BTreeMap::new();
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
                        if let Some(depth) = parse_depth(&value, symbol, &mut bids_map, &mut asks_map, now_ms()) {
                            sink(Event::Depth { depth });
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
