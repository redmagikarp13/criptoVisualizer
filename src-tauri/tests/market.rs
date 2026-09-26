use criptovisualizer_lib::market::{types::Candle, binance::{parse_history, parse_stream, merge_candles}, okx::parse_ticker as parse_okx, bybit::parse_ticker as parse_bybit};
use serde_json::json;

async fn live_feed(exchange: &str) {
    use criptovisualizer_lib::market::{self, types::{Event, MarketRequest, Sink}};
    use std::{sync::Arc, time::Duration};
    use tokio_util::sync::CancellationToken;
    let request = MarketRequest { id: "smoke".into(), symbol: "BTCUSDT".into(), interval: "1m".into(), favorites: vec!["BTCUSDT".into(), "ETHUSDT".into(), "SOLUSDT".into()] };
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let sink: Sink = Arc::new(move |event| { let _ = sender.send(event); });
    let token = CancellationToken::new();
    let client = market::http::client();
    let task = match exchange {
        "binance" => tokio::spawn(market::binance::run(client, request, sink, token.clone())),
        "bybit" => tokio::spawn(market::bybit::run(client, request, sink, token.clone())),
        _ => tokio::spawn(market::okx::run(client, request, sink, token.clone())),
    };
    let result = tokio::time::timeout(Duration::from_secs(45), async {
        let mut history = exchange != "binance";
        let mut quote_seen = false;
        let mut update_seen = exchange != "binance";
        while let Some(event) = receiver.recv().await {
            match event {
                Event::History { candles } => {
                    assert_eq!(candles.len(), 1000);
                    assert!(candles.windows(2).all(|w| w[0].time < w[1].time));
                    assert!(candles.iter().all(|c| c.validate().is_ok()));
                    history = true;
                }
                Event::Candle { candle } => { assert!(candle.validate().is_ok()); update_seen = true; }
                Event::Quote { quote } if quote.symbol == "BTCUSDT" => {
                    assert!(quote.price > 0.0);
                    assert!(quote.time.abs_diff(criptovisualizer_lib::error::now_ms()) < 10_000);
                    println!("{}: preço {}, timestamp {}", quote.exchange, quote.price, quote.time);
                    quote_seen = true;
                }
                Event::Status { exchange, status, message } => println!("{exchange} {status}: {message}"),
                _ => {}
            }
            if history && quote_seen && update_seen { return; }
        }
        panic!("O stream terminou antes de entregar dados válidos");
    }).await;
    token.cancel();
    tokio::time::timeout(Duration::from_secs(3), task).await.unwrap().unwrap();
    result.expect("A exchange não entregou histórico/cotação/atualização no prazo");
}
#[tokio::test]
#[ignore = "Requer conexão pública com a Binance; executar explicitamente"]
async fn rede_binance_entrega_historico_e_stream_reais() { live_feed("binance").await; }
#[tokio::test]
#[ignore = "Requer conexão pública com a OKX; executar explicitamente"]
async fn rede_okx_entrega_cotacao_real() { live_feed("okx").await; }
#[tokio::test]
#[ignore = "Requer conexão pública com a Bybit; executar explicitamente"]
async fn rede_bybit_entrega_cotacao_real() { live_feed("bybit").await; }

#[test]
fn bybit_extrai_ticker_e_recusa_outro_simbolo() {
    let data = json!({"topic":"tickers.BTCUSDT","ts":100000,"type":"snapshot","data":{"symbol":"BTCUSDT","lastPrice":"100","price24hPcnt":"-0.025"}});
    let quote = parse_bybit(&data, "BTCUSDT", 100001).unwrap();
    assert_eq!(quote.price, 100.0);
    assert_eq!(quote.change_24h, -2.5);
    assert_eq!(quote.exchange, "bybit");
    assert!(parse_bybit(&data, "ETHUSDT", 100001).is_none());
}

#[test]
fn okx_preserva_mercado_e_timestamp_e_rejeita_outro_par() {
    let data = json!({"arg":{"channel":"tickers","instId":"BTC-USDT"},"data":[{"instId":"BTC-USDT","last":"100","open24h":"80","ts":"100000"}]});
    let quote = parse_okx(&data, "BTCUSDT", 100001).unwrap();
    assert_eq!(quote.symbol, "BTCUSDT");
    assert_eq!(quote.time, 100000);
    assert_eq!(quote.change_24h, 25.0);
    assert!(parse_okx(&data, "ETHUSDT", 100001).is_none());
}


#[tokio::test]
#[ignore = "Requer conexão pública com a Binance; executar explicitamente"]
async fn rede_binance_entrega_catalogo_para_busca() {
    use criptovisualizer_lib::market::{binance, http};
    let catalog = binance::instruments(&http::client()).await.expect("Catálogo Spot disponível");
    assert!(catalog.len() > 3);
    for symbol in ["BTCUSDT", "ETHUSDT", "SOLUSDT"] {
        assert!(catalog.iter().any(|item| item.symbol == symbol));
    }
    assert!(catalog.iter().all(|item| !item.quote.is_empty() && item.symbol.ends_with(&item.quote)));
    assert!(catalog.iter().any(|item| item.quote != "USDT"), "esperado incluir cotações além de USDT");
    assert!(catalog.windows(2).all(|items| items[0].symbol < items[1].symbol));
    println!("Catálogo recebido: {} pares Spot (multi-cotação)", catalog.len());
}

#[tokio::test]
async fn cliente_http_decodifica_catalogo_comprimido() {
    use criptovisualizer_lib::market::http;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
            request.push(socket.read_u8().await.unwrap());
            assert!(request.len() < 8192);
        }
        // Corpo gzip de {"ok":true}; fixture independente do decodificador HTTP.
        let body: &[u8] = &[31,139,8,0,0,0,0,0,0,10,171,86,202,207,86,178,42,41,42,77,173,5,0,144,95,212,167,11,0,0,0];
        socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\nContent-Length: 31\r\nConnection: close\r\n\r\n").await.unwrap();
        socket.write_all(body).await.unwrap();
    });
    let result = http::get(&http::client(), &format!("http://{address}/catalog")).await;
    server.await.unwrap();
    assert_eq!(result.unwrap(), json!({"ok": true}));
}

#[test]
fn normaliza_historico_e_identifica_candle_fechado() {
    let input = json!([[60000,"10","12","9","11","30",119999,"0",1,"0","0","0"]]);
    let result = parse_history(&input, 120000).unwrap();
    assert_eq!(result[0].time, 60);
    assert_eq!(result[0].close, 11.0);
    assert!(result[0].closed);
    assert!(!parse_history(&input, 100000).unwrap()[0].closed);
}

#[test]
fn rejeita_candle_invalido() {
    assert!(parse_history(&json!([[60000,"10","8","9","11","30",119999]]), 120000).is_err());
    assert!(parse_history(&json!([[60000,"NaN","12","9","11","30",119999]]), 120000).is_err());
}

#[test]
fn mescla_sem_duplicar_e_sem_reabrir_candle_fechado() {
    let candle = Candle {time: 60, open: 10.0, high: 12.0, low: 9.0, close: 11.0, volume: 30.0, closed: true};
    let mut stale = candle.clone(); stale.closed = false; stale.close = 10.0;
    let merged = merge_candles(vec![candle.clone()], vec![stale]);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].close, 11.0);
    assert!(merged[0].closed);
}

#[test]
fn janela_fica_limitada_a_mil_candles_ordenados() {
    let candles = (0..1100).rev().map(|i| Candle {time: i * 60, open: 1.0, high: 1.0, low: 1.0, close: 1.0, volume: 0.0, closed: true}).collect();
    let result = merge_candles(candles, vec![]);
    assert_eq!(result.len(), 1000);
    assert_eq!(result[0].time, 6000);
}

#[test]
fn extrai_evento_de_stream_combinado() {
    let data = json!({"stream":"btcusdt@ticker", "data":{"e":"24hrTicker", "E":100000, "s":"BTCUSDT", "c":"100", "P":"2.5"}});
    let event = parse_stream(&data, 100001).unwrap();
    assert_eq!(serde_json::to_value(event).unwrap()["quote"]["change24h"], 2.5);
}

#[test]
fn extrai_evento_de_depth_combinado() {
    let data = json!({
        "stream": "enausdc@depth20@100ms",
        "data": {
            "lastUpdateId": 12345,
            "bids": [["0.2650", "100.0"], ["0.2640", "200.0"]],
            "asks": [["0.2660", "150.0"], ["0.2670", "300.0"]]
        }
    });
    let event = parse_stream(&data, 100002).unwrap();
    let val = serde_json::to_value(event).unwrap();
    assert_eq!(val["kind"], "depth");
    assert_eq!(val["depth"]["symbol"], "ENAUSDC");
    assert_eq!(val["depth"]["bids"].as_array().unwrap().len(), 2);
    assert_eq!(val["depth"]["asks"].as_array().unwrap().len(), 2);
}
