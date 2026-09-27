use super::{http, types::*};
use crate::error::{now_ms, AppError, Result};
use crate::preferences::split_symbol;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_util::sync::CancellationToken;

pub fn parse_ticker(value: &Value, symbol: &str, received: u64) -> Option<Quote> {
    let (base, quote) = split_symbol(symbol)?;
    let expected = format!("{base}-{quote}");
    let row = value["data"].as_array()?.first()?;
    if value["arg"]["channel"] != "tickers" || row["instId"] != expected { return None; }
    let price = number(&row["last"])?; let open = number(&row["open24h"])?;
    if price <= 0.0 || open <= 0.0 { return None; }
    Some(Quote { symbol: symbol.into(), price, change_24h: (price / open - 1.0) * 100.0,
        time: row["ts"].as_str()?.parse().ok()?, received_at: received, exchange: "okx".into() })
}

pub fn parse_depth(value: &Value, symbol: &str, received: u64) -> Option<OrderBook> {
    let (base, quote) = split_symbol(symbol)?;
    let expected = format!("{base}-{quote}");
    let channel = value["arg"]["channel"].as_str()?;
    if channel != "books5" && channel != "books" { return None; }
    if value["arg"]["instId"].as_str()? != expected { return None; }
    let row = value["data"].as_array()?.first()?;
    let parse_levels = |val: &Value| -> Option<Vec<DepthLevel>> {
        let list = val.as_array()?;
        let mut levels = Vec::with_capacity(list.len());
        for item in list {
            let arr = item.as_array()?;
            if arr.len() >= 2 {
                let price = number(&arr[0])?;
                let amount = number(&arr[1])?;
                if price > 0.0 && amount >= 0.0 {
                    levels.push(DepthLevel { price, amount });
                }
            }
        }
        Some(levels)
    };
    let bids = parse_levels(&row["bids"])?;
    let asks = parse_levels(&row["asks"])?;
    let time = row["ts"].as_str().and_then(|s| s.parse().ok()).unwrap_or(received);
    Some(OrderBook {
        symbol: symbol.into(),
        bids,
        asks,
        time,
        exchange: Some("okx".into()),
    })
}

async fn session(client: &reqwest::Client, symbol: &str, sink: &Sink) -> Result<()> {
    let (base, quote) = split_symbol(symbol).ok_or_else(|| AppError::new("pair_unavailable", "Par inválido para comparação."))?;
    let inst = format!("{base}-{quote}");
    let listing = http::get(client, &format!("https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId={inst}")).await?;
    let available = listing["data"].as_array().is_some_and(|rows| rows.iter().any(|r| r["instId"] == inst && r["state"] == "live" && r["quoteCcy"] == quote && r["instType"] == "SPOT"));
    if !available { return Err(AppError::new("pair_unavailable", format!("Este par Spot/{quote} não está disponível na OKX."))); }
    let (mut socket, _) = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async("wss://ws.okx.com:8443/ws/v5/public")).await
        .map_err(|_| AppError::new("network", "Tempo esgotado ao conectar à OKX."))?
        .map_err(|_| AppError::new("network", "Comparação indisponível: conexão OKX falhou."))?;
    socket.send(WsMessage::Text(json!({
        "op": "subscribe",
        "args": [
            { "channel": "tickers", "instId": inst },
            { "channel": "books5", "instId": inst }
        ]
    }).to_string().into())).await
        .map_err(|_| AppError::new("network", "Assinatura OKX interrompida."))?;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(15));
    let mut last_message = Instant::now();
    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if last_message.elapsed() > Duration::from_secs(35) { return Err(AppError::new("network", "OKX sem resposta ao heartbeat.")); }
                socket.send(WsMessage::Text("ping".into())).await.map_err(|_| AppError::new("network", "Conexão OKX interrompida."))?;
            }
            message = socket.next() => {
                match message {
                    Some(Ok(WsMessage::Text(text))) => {
                        last_message = Instant::now();
                        if text == "pong" { continue; }
                        let value: Value = serde_json::from_str(&text).map_err(|_| AppError::new("invalid_data", "Mensagem OKX inválida."))?;
                        if value["event"] == "error" { return Err(AppError::new("exchange_unavailable", "A OKX recusou a assinatura deste instrumento.")); }
                        if let Some(quote) = parse_ticker(&value, symbol, now_ms()) {
                            status(sink, "okx", "connected", "OKX Spot conectada");
                            sink(Event::Quote { quote });
                        }
                        if let Some(depth) = parse_depth(&value, symbol, now_ms()) {
                            sink(Event::Depth { depth });
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => { socket.send(WsMessage::Pong(data)).await.map_err(|_| AppError::new("network", "Conexão OKX interrompida."))?; }
                    Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => return Err(AppError::new("network", "Conexão OKX interrompida.")),
                    _ => {}
                }
            }
        }
    }
}
pub async fn run(client: reqwest::Client, request: MarketRequest, sink: Sink, cancel: CancellationToken) {
    let mut attempt = 0u32;
    loop {
        status(&sink, "okx", if attempt == 0 { "connecting" } else { "reconnecting" }, "Conectando à OKX…");
        let started = Instant::now();
        let result = tokio::select! { _ = cancel.cancelled() => return, result = session(&client, &request.symbol, &sink) => result };
        if let Err(error) = result {
            status(&sink, "okx", "error", &error.message);
            if error.code == "pair_unavailable" { return; }
        }
        if started.elapsed() > Duration::from_secs(60) { attempt = 0; }
        let delay = (1u64 << attempt.min(5)) as f64 + rand::random::<f64>();
        attempt += 1;
        tokio::select! { _ = cancel.cancelled() => return, _ = tokio::time::sleep(Duration::from_secs_f64(delay)) => {} }
    }
}
