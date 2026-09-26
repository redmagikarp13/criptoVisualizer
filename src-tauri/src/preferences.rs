use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, io::Write, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorSettings {
    pub sma: bool, pub ema: bool, pub rsi: bool, pub macd: bool, pub bands: bool,
    pub sma_period: u16, pub ema_fast_period: u16, pub ema_slow_period: u16,
}
fn default_alert_mode() -> String { "recurring".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub symbol: String,
    pub direction: String,
    pub price: f64,
    pub enabled: bool,
    #[serde(default = "default_alert_mode")]
    pub mode: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub version: u8, pub favorites: Vec<String>, pub symbol: String, pub interval: String,
    pub theme: String, pub indicators: IndicatorSettings, pub agent: String,
    pub antigravity_enabled: bool, pub qoder_path: String, pub antigravity_path: String,
    pub qoder_model: String, pub antigravity_model: String,
    #[serde(default)] pub alerts: Vec<Alert>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            favorites: vec![
                "BTCUSDT".into(), "ETHUSDT".into(), "SOLUSDT".into(),
                "ENAUSDC".into(), "IOTAUSDC".into(),
            ],
            symbol: "BTCUSDT".into(),
            interval: "1h".into(),
            theme: "system".into(),
            indicators: IndicatorSettings { sma: true, ema: true, rsi: true, macd: false, bands: false, sma_period: 20, ema_fast_period: 20, ema_slow_period: 50 },
            agent: "qoder".into(),
            antigravity_enabled: false,
            qoder_path: String::new(),
            antigravity_path: String::new(),
            qoder_model: String::new(),
            antigravity_model: String::new(),
            alerts: vec![
                Alert { id: "ena-breakout-0274".into(), symbol: "ENAUSDC".into(), direction: "above".into(), price: 0.274, enabled: true, mode: "recurring".into() },
                Alert { id: "ena-support-0250".into(), symbol: "ENAUSDC".into(), direction: "below".into(), price: 0.250, enabled: true, mode: "recurring".into() },
                Alert { id: "ena-support-0230".into(), symbol: "ENAUSDC".into(), direction: "below".into(), price: 0.230, enabled: true, mode: "recurring".into() },
                Alert { id: "iota-resistance-0052".into(), symbol: "IOTAUSDC".into(), direction: "above".into(), price: 0.052, enabled: true, mode: "recurring".into() },
                Alert { id: "iota-support-0046".into(), symbol: "IOTAUSDC".into(), direction: "below".into(), price: 0.046, enabled: true, mode: "recurring".into() },
            ],
        }
    }
}
// Cotações reconhecidas no Spot da Binance. A correspondência usa o sufixo mais
// longo para separar base e cotação (ex.: BTCUSDC -> BTC/USDC, XRPEURI -> XRP/EURI).
pub const QUOTES: &[&str] = &[
    "USDT", "USDC", "FDUSD", "TUSD", "DAI", "EURI", "EUR", "GBP", "TRY", "BRL", "ARS",
    "COP", "MXN", "RUB", "UAH", "ZAR", "JPY", "AUD", "CAD", "CHF", "PLN", "SEK", "NOK",
    "AED", "NGN", "PEN", "CZK", "RON", "DOP", "GEL", "KES", "RSD", "BAM", "MKD", "ALL",
    "BTC", "ETH", "BNB",
];
pub fn split_symbol(value: &str) -> Option<(String, String)> {
    if value.len() < 5 || value.len() > 24 || !value.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) { return None; }
    let mut best: Option<(&str, usize)> = None;
    for quote in QUOTES {
        let ql = quote.len();
        if value.len() <= ql + 1 { continue; }
        if value.len() > 24 { break; }
        if value.ends_with(quote) {
            let base_len = value.len() - ql;
            if base_len >= 2 && best.is_none_or(|(_, l)| ql > l) { best = Some((quote, ql)); }
        }
    }
    let (quote, ql) = best?;
    Some((value[..value.len() - ql].to_string(), quote.to_string()))
}
pub fn valid_symbol(value: &str) -> bool { split_symbol(value).is_some() }
pub fn valid_interval(value: &str) -> bool { ["1m", "5m", "15m", "1h", "4h", "1d"].contains(&value) }
impl Preferences {
    pub fn validate(&self) -> Result<()> {
        let model_valid = |s: &str| s.len() <= 100 && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"_.:/-".contains(&c));
        let alert_valid = |a: &Alert| !a.id.is_empty() && a.id.len() <= 64 && valid_symbol(&a.symbol)
            && matches!(a.direction.as_str(), "above" | "below" | "cross")
            && matches!(a.mode.as_str(), "once" | "recurring")
            && a.price.is_finite() && a.price > 0.0;
        if self.version != 1 || !valid_symbol(&self.symbol) || !valid_interval(&self.interval)
            || self.favorites.len() > 20 || self.favorites.iter().any(|s| !valid_symbol(s))
            || self.favorites.iter().collect::<HashSet<_>>().len() != self.favorites.len()
            || !["system", "light", "dark"].contains(&self.theme.as_str())
            || !["qoder", "antigravity"].contains(&self.agent.as_str())
            || self.qoder_path.len() > 1024 || self.antigravity_path.len() > 1024
            || !model_valid(&self.qoder_model) || !model_valid(&self.antigravity_model)
            || self.alerts.len() > 50 || self.alerts.iter().any(|a| !alert_valid(a))
            || [self.indicators.sma_period, self.indicators.ema_fast_period, self.indicators.ema_slow_period].iter().any(|p| !(2..=200).contains(p)) {
            return Err(AppError::new("invalid_settings", "Configuração inválida. Revise os pares, períodos e caminhos."));
        }
        Ok(())
    }
}
#[derive(Serialize)]
pub struct LoadedPreferences { pub preferences: Preferences, pub warning: Option<String> }
pub fn load(path: &Path) -> LoadedPreferences {
    if !path.exists() { return LoadedPreferences { preferences: Preferences::default(), warning: None }; }
    let loaded = (|| {
        if std::fs::metadata(path).ok()?.len() > 1_048_576 { return None; }
        let bytes = std::fs::read(path).ok()?;
        let value: Preferences = serde_json::from_slice(&bytes).ok()?;
        value.validate().ok()?;
        Some(value)
    })();
    match loaded {
        Some(preferences) => LoadedPreferences { preferences, warning: None },
        None => LoadedPreferences { preferences: Preferences::default(), warning: Some("Não foi possível ler as preferências. Os padrões foram restaurados; o arquivo original não foi alterado.".into()) },
    }
}
pub fn save(path: &Path, preferences: &Preferences) -> Result<()> {
    preferences.validate()?;
    let parent = path.parent().ok_or_else(|| AppError::new("settings_io", "Caminho de preferências inválido."))?;
    let io_error = |_| AppError::new("settings_io", "Não foi possível salvar as preferências. Verifique a permissão da pasta do aplicativo.");
    std::fs::create_dir_all(parent).map_err(io_error)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io_error)?;
    let bytes = serde_json::to_vec_pretty(preferences).map_err(|_| AppError::new("settings_io", "Configuração não serializável."))?;
    temporary.write_all(&bytes).map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    temporary.persist(path).map_err(|_| AppError::new("settings_io", "Não foi possível substituir o arquivo de preferências."))?;
    Ok(())
}
