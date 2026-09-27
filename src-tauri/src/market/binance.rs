use super::{http, types::*};
use crate::{error::{now_ms, AppError, Result}, preferences::valid_symbol};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::{collections::{BTreeMap, BTreeSet}, time::Duration};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_util::sync::CancellationToken;

const REST: &str = "https://data-api.binance.vision";
fn invalid() -> AppError { AppError::new("invalid_data", "Histórico de mercado inválido.") }

pub fn parse_history(value: &Value, now: u64) -> Result<Vec<Candle>> {
    value.as_array().ok_or_else(invalid)?.iter().map(|row| {
        let candle = Candle {
            time: row[0].as_u64().ok_or_else(invalid)? / 1000,
            open: number(&row[1]).ok_or_else(invalid)?, high: number(&row[2]).ok_or_else(invalid)?,
            low: number(&row[3]).ok_or_else(invalid)?, close: number(&row[4]).ok_or_else(invalid)?,
            volume: number(&row[5]).ok_or_else(invalid)?, closed: row[6].as_u64().ok_or_else(invalid)? < now,
        };
        candle.validate()?; Ok(candle)
    }).collect()
}
pub fn merge_candles(history: Vec<Candle>, updates: Vec<Candle>) -> Vec<Candle> {
    let mut map: BTreeMap<u64, Candle> = BTreeMap::new();
    for candle in history.into_iter().chain(updates) {
        if let Some(old) = map.get(&candle.time) {
            if old.closed && !candle.closed || old.volume > candle.volume { continue; }
        }
        map.insert(candle.time, candle);
    }
    let skip = map.len().saturating_sub(1000);
    map.into_values().skip(skip).collect()
}
pub fn parse_stream(value: &Value, received: u64) -> Option<Event> {
    let v = value.get("data").unwrap_or(value);
    if let (Some(bids_val), Some(asks_val)) = (v.get("bids"), v.get("asks")) {
        let stream = value.get("stream").and_then(|s| s.as_str()).unwrap_or("");
        let symbol = if let Some(sym) = stream.split('@').next() {
            sym.to_uppercase()
        } else if let Some(s) = v.get("s").and_then(|s| s.as_str()) {
            s.to_uppercase()
        } else {
            return None;
        };
        let parse_levels = |val: &Value| -> Option<Vec<DepthLevel>> {
            let list = val.as_array()?;
            let mut levels = Vec::with_capacity(list.len());
            for item in list {
                let row = item.as_array()?;
                if row.len() >= 2 {
                    let price = number(&row[0])?;
                    let amount = number(&row[1])?;
                    if price > 0.0 && amount >= 0.0 {
                        levels.push(DepthLevel { price, amount });
                    }
                }
            }
            Some(levels)
        };
        let bids = parse_levels(bids_val)?;
        let asks = parse_levels(asks_val)?;
        return Some(Event::Depth {
            depth: OrderBook {
                symbol,
                bids,
                asks,
                time: received,
                exchange: Some("binance".into()),
            }
        });
    }

    match v["e"].as_str()? {
        "kline" => {
            let k = &v["k"];
            let candle = Candle { time: k["t"].as_u64()? / 1000, open: number(&k["o"])?, high: number(&k["h"])?,
                low: number(&k["l"])?, close: number(&k["c"])?, volume: number(&k["v"])?, closed: k["x"].as_bool()? };
            candle.validate().ok()?;
            Some(Event::Candle { candle })
        }
        "24hrTicker" => {
            let symbol = v["s"].as_str()?.to_string(); let price = number(&v["c"])?;
            if !valid_symbol(&symbol) || price <= 0.0 { return None; }
            Some(Event::Quote { quote: Quote { symbol, price, change_24h: number(&v["P"])?, time: v["E"].as_u64()?, received_at: received, exchange: "binance".into() } })
        }
        _ => None,
    }
}
pub async fn instruments(client: &reqwest::Client) -> Result<Vec<Instrument>> {
    // Evita carregar permissões de contas e instrumentos inativos, que não usamos.
    let value = http::get(client, &format!("{REST}/api/v3/exchangeInfo?permissions=SPOT&showPermissionSets=false&symbolStatus=TRADING")).await?;
    let mut result: Vec<Instrument> = value["symbols"].as_array().ok_or_else(invalid)?.iter().filter_map(|v| {
        let symbol = v["symbol"].as_str()?;
        let quote = v["quoteAsset"].as_str()?;
        if v["status"] != "TRADING" || v["isSpotTradingAllowed"] != true || !crate::preferences::QUOTES.contains(&quote) || !valid_symbol(symbol) { return None; }
        Some(Instrument { symbol: symbol.into(), base: v["baseAsset"].as_str()?.into(), quote: quote.into() })
    }).collect();
    result.sort_by(|a, b| a.symbol.cmp(&b.symbol));
    Ok(result)
}
async fn history(client: &reqwest::Client, request: &MarketRequest) -> Result<Vec<Candle>> {
    let url = format!("{REST}/api/v3/klines?symbol={}&interval={}&limit=1000", request.symbol, request.interval);
    parse_history(&http::get(client, &url).await?, now_ms())
}
fn interval_seconds(interval: &str) -> u64 {
    match interval { "1m" => 60, "5m" => 300, "15m" => 900, "1h" => 3600, "4h" => 14400, _ => 86400 }
}
async fn session(client: &reqwest::Client, request: &MarketRequest, sink: &Sink) -> Result<()> {
    let mut symbols: BTreeSet<String> = request.favorites.iter().map(|s| s.to_lowercase()).collect();
    symbols.insert(request.symbol.to_lowercase());
    let mut streams: Vec<String> = symbols.iter().map(|s| format!("{s}@ticker")).collect();
    streams.push(format!("{}@kline_{}", request.symbol.to_lowercase(), request.interval));
    streams.push(format!("{}@depth20@100ms", request.symbol.to_lowercase()));
    let url = format!("wss://data-stream.binance.vision:443/stream?streams={}", streams.join("/"));
    let (mut socket, _) = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(url)).await
        .map_err(|_| AppError::new("network", "Tempo esgotado ao conectar à Binance."))?
        .map_err(|_| AppError::new("network", "Não foi possível abrir o stream da Binance."))?;
    let pending_history = history(client, request);
    tokio::pin!(pending_history);
    let mut synced = false;
    let mut buffered = Vec::new();
    let mut last_time = 0;
    let renewal = tokio::time::sleep(Duration::from_secs(23 * 3600));
    tokio::pin!(renewal);
    loop {
        tokio::select! {
            result = &mut pending_history, if !synced => {
                let merged = merge_candles(result?, std::mem::take(&mut buffered));
                last_time = merged.last().map(|c| c.time).unwrap_or(0);
                sink(Event::History { candles: merged });
                synced = true;
                status(sink, "binance", "connected", "Binance Spot conectada");
            }
            message = socket.next() => {
                match message {
                    Some(Ok(WsMessage::Text(text))) => {
                        let value: Value = serde_json::from_str(&text).map_err(|_| invalid())?;
                        if let Some(event) = parse_stream(&value, now_ms()) {
                            if let Event::Candle { ref candle } = event {
                                if !synced {
                                    buffered = merge_candles(buffered, vec![candle.clone()]);
                                    continue;
                                }
                                if last_time > 0 && candle.time > last_time + interval_seconds(&request.interval) {
                                    return Err(AppError::new("gap", "Lacuna detectada. Recuperando o histórico."));
                                }
                                last_time = last_time.max(candle.time);
                            }
                            sink(event);
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => { socket.send(WsMessage::Pong(data)).await.map_err(|_| invalid())?; }
                    Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => return Err(AppError::new("network", "Conexão Binance interrompida.")),
                    _ => {}
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(45)) => return Err(AppError::new("network", "Stream sem resposta. Reconectando.")),
            _ = &mut renewal => return Err(AppError::new("renew", "Renovando a conexão Binance.")),
        }
    }
}
pub async fn run(client: reqwest::Client, request: MarketRequest, sink: Sink, cancel: CancellationToken) {
    let mut attempt = 0u32;
    loop {
        status(&sink, "binance", if attempt == 0 { "connecting" } else { "reconnecting" }, "Sincronizando candles e cotações…");
        let started = std::time::Instant::now();
        let result = tokio::select! { _ = cancel.cancelled() => return, result = session(&client, &request, &sink) => result };
        if started.elapsed() > Duration::from_secs(60) { attempt = 0; }
        if let Err(error) = result { status(&sink, "binance", "reconnecting", &error.message); }
        let delay = (1u64 << attempt.min(5)) as f64 + rand::random::<f64>();
        attempt += 1;
        tokio::select! { _ = cancel.cancelled() => return, _ = tokio::time::sleep(Duration::from_secs_f64(delay)) => {} }
    }
}

pub async fn fetch_futures_data(client: &reqwest::Client, symbol: &str) -> Result<serde_json::Value> {
    let clean = symbol.trim().to_uppercase();
    if !clean.ends_with("USDT") && !clean.ends_with("USDC") {
        return Ok(serde_json::Value::Null);
    }
    let fapi_base = "https://fapi.binance.com";
    let premium_url = format!("{}/fapi/v1/premiumIndex?symbol={}", fapi_base, clean);
    let oi_url = format!("{}/fapi/v1/openInterest?symbol={}", fapi_base, clean);
    let oi_hist_url = format!("{}/futures/data/openInterestHist?symbol={}&period=15m&limit=8", fapi_base, clean);
    let ls_url = format!("{}/futures/data/globalLongShortAccountRatio?symbol={}&period=15m&limit=2", fapi_base, clean);
    let top_ls_url = format!("{}/futures/data/topLongShortPositionRatio?symbol={}&period=15m&limit=2", fapi_base, clean);

    let (premium_res, oi_res, oi_hist_res, ls_res, top_ls_res) = tokio::join!(
        client.get(&premium_url).send(),
        client.get(&oi_url).send(),
        client.get(&oi_hist_url).send(),
        client.get(&ls_url).send(),
        client.get(&top_ls_url).send(),
    );

    let premium: serde_json::Value = match premium_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => return Ok(serde_json::Value::Null),
    };
    let oi: serde_json::Value = match oi_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => return Ok(serde_json::Value::Null),
    };
    let oi_hist: serde_json::Value = match oi_hist_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => serde_json::Value::Array(vec![]),
    };
    let ls: serde_json::Value = match ls_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => serde_json::Value::Array(vec![]),
    };
    let top_ls: serde_json::Value = match top_ls_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => serde_json::Value::Array(vec![]),
    };

    Ok(serde_json::json!({
        "premium": premium,
        "oi": oi,
        "oi_hist": oi_hist,
        "ls": ls,
        "top_ls": top_ls,
    }))
}
