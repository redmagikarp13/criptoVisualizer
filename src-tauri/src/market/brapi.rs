use super::types::Candle;
use crate::error::{now_ms, AppError, Result};
use reqwest::Url;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrStockSearchResult {
    pub stock: String,
    pub name: String,
    pub close: Option<f64>,
    pub change: Option<f64>,
    pub volume: Option<f64>,
    pub market_cap: Option<f64>,
    pub logo: Option<String>,
    pub sector: Option<String>,
    #[serde(rename = "type")]
    pub stock_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrStockQuote {
    pub ticker: String,
    pub short_name: String,
    pub price: f64,
    pub change: f64,
    pub change_abs: f64,
    pub previous_close: f64,
    pub volume: f64,
    pub market_cap: Option<f64>,
    pub logourl: Option<String>,
    pub updated_at: u64,
}

#[derive(Deserialize)]
struct BrapiListResponse {
    #[serde(default)]
    stocks: Vec<BrapiListStock>,
}

#[derive(Deserialize)]
struct BrapiListStock {
    stock: String,
    #[serde(default)]
    name: String,
    close: Option<f64>,
    change: Option<f64>,
    volume: Option<f64>,
    market_cap: Option<f64>,
    logo: Option<String>,
    sector: Option<String>,
    #[serde(rename = "type")]
    stock_type: Option<String>,
}

#[derive(Deserialize)]
struct BrapiQuoteResponse {
    #[serde(default)]
    results: Vec<BrapiQuoteItem>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrapiQuoteItem {
    symbol: Option<String>,
    short_name: Option<String>,
    long_name: Option<String>,
    regular_market_price: Option<f64>,
    regular_market_change_percent: Option<f64>,
    regular_market_change: Option<f64>,
    regular_market_previous_close: Option<f64>,
    regular_market_volume: Option<f64>,
    market_cap: Option<f64>,
    logourl: Option<String>,
    historical_data_price: Option<Vec<BrapiHistoricalCandle>>,
}

#[derive(Deserialize)]
struct BrapiHistoricalCandle {
    date: u64,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    volume: Option<f64>,
}

const BRAPI_BASE: &str = "https://brapi.dev/api";

pub async fn search_stocks(
    client: &reqwest::Client,
    query: &str,
    token: Option<&str>,
) -> Result<Vec<BrStockSearchResult>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let mut url = Url::parse(&format!("{}/quote/list", BRAPI_BASE))
        .map_err(|e| AppError::new("url_parse", &e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("search", q)
        .append_pair("limit", "15");

    if let Some(t) = token.filter(|t| !t.trim().is_empty()) {
        url.query_pairs_mut().append_pair("token", t.trim());
    }

    let res = client
        .get(url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::new("brapi_network", &format!("Falha na busca da brapi: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::new(
            "brapi_http",
            &format!("brapi retornou status HTTP {}", res.status()),
        ));
    }

    let data: BrapiListResponse = res
        .json()
        .await
        .map_err(|e| AppError::new("brapi_json", &format!("Resposta da brapi inválida: {e}")))?;

    let results = data
        .stocks
        .into_iter()
        .map(|s| BrStockSearchResult {
            stock: s.stock,
            name: s.name,
            close: s.close,
            change: s.change,
            volume: s.volume,
            market_cap: s.market_cap,
            logo: s.logo,
            sector: s.sector,
            stock_type: s.stock_type,
        })
        .collect();

    Ok(results)
}

pub async fn fetch_quotes(
    client: &reqwest::Client,
    tickers: &[String],
    token: Option<&str>,
) -> Result<Vec<BrStockQuote>> {
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let joined = tickers
        .iter()
        .map(|t| t.trim().to_uppercase())
        .collect::<Vec<_>>()
        .join(",");

    let mut url = Url::parse(&format!("{}/quote/{}", BRAPI_BASE, joined))
        .map_err(|e| AppError::new("url_parse", &e.to_string()))?;
    url.query_pairs_mut().append_pair("fundamental", "false");

    if let Some(t) = token.filter(|t| !t.trim().is_empty()) {
        url.query_pairs_mut().append_pair("token", t.trim());
    }

    let res = client
        .get(url)
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await
        .map_err(|e| AppError::new("brapi_network", &format!("Falha ao obter cotações B3: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::new(
            "brapi_http",
            &format!("brapi retornou HTTP {}", res.status()),
        ));
    }

    let data: BrapiQuoteResponse = res
        .json()
        .await
        .map_err(|e| AppError::new("brapi_json", &format!("Resposta de cotações inválida: {e}")))?;

    if let Some(err) = data.error {
        return Err(AppError::new("brapi_api_error", &err));
    }

    let now = now_ms();
    let mut quotes = Vec::new();

    for item in data.results {
        let ticker = match item.symbol {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        let price = match item.regular_market_price {
            Some(p) if p.is_finite() && p > 0.0 => p,
            _ => continue,
        };

        let short_name = item
            .short_name
            .or(item.long_name)
            .unwrap_or_else(|| ticker.clone());

        quotes.push(BrStockQuote {
            ticker,
            short_name,
            price,
            change: item.regular_market_change_percent.unwrap_or(0.0),
            change_abs: item.regular_market_change.unwrap_or(0.0),
            previous_close: item.regular_market_previous_close.unwrap_or(price),
            volume: item.regular_market_volume.unwrap_or(0.0),
            market_cap: item.market_cap,
            logourl: item.logourl,
            updated_at: now,
        });
    }

    Ok(quotes)
}

pub async fn fetch_stock_candles(
    client: &reqwest::Client,
    ticker: &str,
    token: Option<&str>,
) -> Result<Vec<Candle>> {
    let t = ticker.trim().to_uppercase();
    if t.is_empty() {
        return Ok(Vec::new());
    }

    let mut url = Url::parse(&format!("{}/quote/{}", BRAPI_BASE, t))
        .map_err(|e| AppError::new("url_parse", &e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("range", "3mo")
        .append_pair("interval", "1d")
        .append_pair("fundamental", "false");

    if let Some(tok) = token.filter(|tok| !tok.trim().is_empty()) {
        url.query_pairs_mut().append_pair("token", tok.trim());
    }

    let res = client
        .get(url)
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await
        .map_err(|e| AppError::new("brapi_network", &format!("Falha ao obter candles B3: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::new(
            "brapi_http",
            &format!("brapi retornou HTTP {}", res.status()),
        ));
    }

    let data: BrapiQuoteResponse = res
        .json()
        .await
        .map_err(|e| AppError::new("brapi_json", &format!("Resposta de candles inválida: {e}")))?;

    if let Some(err) = data.error {
        return Err(AppError::new("brapi_api_error", &err));
    }

    let mut candles = Vec::new();
    if let Some(first) = data.results.into_iter().next() {
        if let Some(history) = first.historical_data_price {
            for row in history {
                let open = match row.open {
                    Some(v) if v.is_finite() && v > 0.0 => v,
                    _ => continue,
                };
                let close = match row.close {
                    Some(v) if v.is_finite() && v > 0.0 => v,
                    _ => continue,
                };
                let raw_high = row.high.unwrap_or(open.max(close));
                let raw_low = row.low.unwrap_or(open.min(close));
                let high = raw_high.max(open).max(close);
                let low = raw_low.min(open).min(close).max(0.0001);
                let volume = row.volume.unwrap_or(0.0).max(0.0);

                let candle = Candle {
                    time: row.date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    closed: true,
                };
                if candle.validate().is_ok() {
                    candles.push(candle);
                }
            }
        }
    }

    candles.sort_by_key(|c| c.time);
    Ok(candles)
}
