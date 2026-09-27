use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub time: u64, pub open: f64, pub high: f64, pub low: f64,
    pub close: f64, pub volume: f64, pub closed: bool,
}
impl Candle {
    pub fn validate(&self) -> Result<()> {
        if [self.open, self.high, self.low, self.close].iter().any(|p| !p.is_finite() || *p <= 0.0)
            || !self.volume.is_finite() || self.volume < 0.0 || self.high < self.low
            || self.high < self.open.max(self.close) || self.low > self.open.min(self.close) {
            return Err(AppError::new("invalid_data", "A exchange enviou um candle inválido."));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub symbol: String, pub price: f64,
    #[serde(rename = "change24h")]
    pub change_24h: f64,
    pub time: u64, pub received_at: u64, pub exchange: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthLevel {
    pub price: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderBook {
    pub symbol: String,
    pub bids: Vec<DepthLevel>,
    pub asks: Vec<DepthLevel>,
    pub time: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exchange: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instrument { pub symbol: String, pub base: String, pub quote: String }
#[derive(Clone, Deserialize)]
pub struct MarketRequest { pub id: String, pub symbol: String, pub interval: String, pub favorites: Vec<String> }
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Event {
    History { candles: Vec<Candle> }, Candle { candle: Candle }, Quote { quote: Quote },
    Depth { depth: OrderBook },
    Status { exchange: String, status: String, message: String },
}
#[derive(Clone, Serialize)]
pub struct Message { pub id: String, #[serde(flatten)] pub event: Event }
pub type Sink = std::sync::Arc<dyn Fn(Event) + Send + Sync>;
pub fn status(sink: &Sink, exchange: &str, state: &str, message: &str) {
    sink(Event::Status { exchange: exchange.into(), status: state.into(), message: message.into() });
}
pub fn number(value: &serde_json::Value) -> Option<f64> {
    let n = value.as_f64().or_else(|| value.as_str()?.parse().ok())?;
    n.is_finite().then_some(n)
}
