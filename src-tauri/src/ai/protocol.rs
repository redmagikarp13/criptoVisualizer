use crate::error::{AppError, Result};
use serde::Serialize;
use serde_json::{Value, json};
use crate::{market::types::Candle, preferences::{valid_interval, valid_symbol}};

#[derive(Debug, Serialize)]
pub struct AnalysisOutput { pub analysis: Value, pub model: Option<String> }
fn invalid() -> AppError { AppError::new("invalid_response", "A CLI não retornou uma análise estruturada válida. Nenhuma nova tentativa foi iniciada.") }
fn keys(value: &Value, expected: &[&str]) -> bool {
    value.as_object().is_some_and(|map| map.len() == expected.len() && expected.iter().all(|key| map.contains_key(*key)))
}
fn text(value: &Value) -> bool { value.as_str().is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 3000) }
fn texts(value: &Value, max: usize) -> bool { value.as_array().is_some_and(|v| !v.is_empty() && v.len() <= max && v.iter().all(text)) }
pub fn analysis_schema() -> Value {
    let text = json!({"type":"string","minLength":1,"maxLength":3000});
    let list = json!({"type":"array","minItems":1,"maxItems":10,"items":text});
    json!({"type":"object","additionalProperties":false,"required":["summary","trend","evidence","scenarios","risks","limitations"],"properties":{
        "summary":text,"trend":{"type":"string","enum":["alta","baixa","lateral","indefinida"]},"evidence":list,"risks":list,"limitations":list,
        "scenarios":{"type":"array","minItems":1,"maxItems":5,"items":{"type":"object","additionalProperties":false,"required":["condition","interpretation"],"properties":{"condition":text,"interpretation":text}}}
    }})
}
pub fn validate_analysis(value: &Value) -> Result<()> {
    if !keys(value, &["summary","trend","evidence","scenarios","risks","limitations"]) || !text(&value["summary"])
        || !matches!(value["trend"].as_str(), Some("alta" | "baixa" | "lateral" | "indefinida"))
        || !["evidence","risks","limitations"].iter().all(|key| texts(&value[key], 10))
        || !value["scenarios"].as_array().is_some_and(|items| !items.is_empty() && items.len() <= 5 && items.iter().all(|v| keys(v, &["condition","interpretation"]) && text(&v["condition"]) && text(&v["interpretation"]))) {
        return Err(invalid());
    }
    Ok(())
}
fn model(value: &Value) -> Option<String> { value.as_str().filter(|s| !s.is_empty() && s.chars().count() <= 100 && !s.chars().any(char::is_control)).map(str::to_owned) }
fn content(value: &Value) -> Result<Value> {
    if let Some(text) = value.as_str() { serde_json::from_str(text).map_err(|_| invalid()) } else { Ok(value.clone()) }
}
pub fn parse_qoder(output: &str) -> Result<AnalysisOutput> {
    let value: Value = serde_json::from_str(output).map_err(|_| invalid())?;
    if value["is_error"].as_bool() == Some(true) || value["subtype"].as_str().is_some_and(|s| s != "success") {
        return Err(super::process::classify_failure(output));
    }
    if value["type"] != "result" || value["subtype"] != "success" { return Err(invalid()); }
    let analysis = content(&value["result"])?; validate_analysis(&analysis)?;
    Ok(AnalysisOutput { analysis, model: model(&value["model"]) })
}
#[derive(Default)]
pub struct AntigravityStream { pending: Vec<u8>, result: Option<Value>, reported_model: Option<String>, received: usize }
impl AntigravityStream {
    pub fn feed(&mut self, bytes: &[u8]) -> Result<()> {
        self.received = self.received.saturating_add(bytes.len());
        if self.received > 2 * 1024 * 1024 { return Err(AppError::new("output_limit", "A CLI excedeu o limite de saída.")); }
        // A linha completa preserva caracteres UTF-8 divididos entre leituras.
        for segment in bytes.split_inclusive(|byte| *byte == b'\n') {
            self.pending.extend_from_slice(segment);
            if segment.last() == Some(&b'\n') { self.line()?; }
        }
        Ok(())
    }
    fn line(&mut self) -> Result<()> {
        let bytes = std::mem::take(&mut self.pending);
        let line = std::str::from_utf8(&bytes).map_err(|_| invalid())?.trim();
        if line.is_empty() { return Ok(()); }
        if self.result.is_some() { return Err(invalid()); }
        let event: Value = serde_json::from_str(line).map_err(|_| invalid())?;
        if !event.is_object() || !event["event"].is_string() { return Err(invalid()); }
        if let Some(value) = model(&event["model"]).or_else(|| model(&event["result"]["model"])) { self.reported_model = Some(value); }
        if event["event"] == "error" { return Err(super::process::classify_failure(line)); }
        if event["event"] == "result" {
            if event["result"]["status"] != "SUCCESS" { return Err(super::process::classify_failure(line)); }
            let value = &event["result"];
            let analysis = content(if value["structured_output"].is_null() { &value["response"] } else { &value["structured_output"] })?;
            validate_analysis(&analysis)?;
            self.result = Some(analysis);
        }
        Ok(())
    }
    pub fn finish(mut self) -> Result<AnalysisOutput> {
        self.line()?;
        Ok(AnalysisOutput { analysis: self.result.ok_or_else(invalid)?, model: self.reported_model })
    }
}
pub fn parse_antigravity(output: &str) -> Result<AnalysisOutput> {
    let mut stream = AntigravityStream::default();
    stream.feed(output.as_bytes())?;
    stream.finish()
}
fn snapshot_error() -> AppError { AppError::new("invalid_snapshot", "Snapshot inválido. Aguarde candles fechados e tente novamente.") }
fn valid_comparison(value: &Value, symbol: &str, now: u64) -> bool {
    if value.is_null() { return true; }
    if !keys(value, &["binance","okx","difference"]) { return false; }
    for exchange in ["binance", "okx"] {
        let quote = &value[exchange];
        if !keys(quote, &["symbol","price","change24h","time","receivedAt","exchange"]) || quote["symbol"] != symbol || quote["exchange"] != exchange
            || !quote["price"].as_f64().is_some_and(|n| n > 0.0 && n.is_finite()) || !quote["change24h"].is_number()
            || !["time", "receivedAt"].iter().all(|key| quote[key].as_u64().is_some_and(|t| now.saturating_sub(t) <= 10_000 && t.saturating_sub(now) <= 2_000)) { return false; }
    }
    let a = value["binance"]["time"].as_u64().unwrap(); let b = value["okx"]["time"].as_u64().unwrap();
    let expected = (value["okx"]["price"].as_f64().unwrap() / value["binance"]["price"].as_f64().unwrap() - 1.0) * 100.0;
    a.abs_diff(b) <= 5000 && value["difference"].as_f64().is_some_and(|n| (n - expected).abs() < 1e-8)
}
fn valid_orderbook(ob: &Value) -> bool {
    if ob.is_null() { return true; }
    let has_base = keys(ob, &["spread","spreadPercent","bidPressurePercent","askPressurePercent","topBidWall","topAskWall","botBias","spoofDetected","hftActive"]);
    let has_with_pressure = keys(ob, &["spread","spreadPercent","bidPressurePercent","askPressurePercent","topBidWall","topAskWall","botBias","spoofDetected","hftActive","botPressure"]);
    if !has_base && !has_with_pressure {
        return false;
    }
    let valid_wall = |w: &Value| {
        if w.is_null() { return true; }
        keys(w, &["price","amount","ratioToAverage"])
            && w["price"].as_f64().is_some_and(|n| n > 0.0 && n.is_finite())
            && w["amount"].as_f64().is_some_and(|n| n >= 0.0 && n.is_finite())
            && w["ratioToAverage"].as_f64().is_some_and(|n| n >= 0.0 && n.is_finite())
    };
    let valid_pressure = |p: &Value| {
        if p.is_null() { return true; }
        keys(p, &["direction","score","headline","tactic"])
            && matches!(p["direction"].as_str(), Some("pushing_up" | "pushing_down" | "neutral"))
            && p["score"].as_f64().is_some_and(|n| (-100.0..=100.0).contains(&n))
            && text(&p["headline"])
            && text(&p["tactic"])
    };
    ob["spread"].as_f64().is_some_and(|n| n >= 0.0 && n.is_finite())
        && ob["spreadPercent"].as_f64().is_some_and(|n| n >= 0.0 && n.is_finite())
        && ob["bidPressurePercent"].as_f64().is_some_and(|n| (0.0..=100.0).contains(&n))
        && ob["askPressurePercent"].as_f64().is_some_and(|n| (0.0..=100.0).contains(&n))
        && matches!(ob["botBias"].as_str(), Some("bullish" | "bearish" | "neutral"))
        && ob["spoofDetected"].is_boolean()
        && ob["hftActive"].is_boolean()
        && valid_wall(&ob["topBidWall"])
        && valid_wall(&ob["topAskWall"])
        && (!has_with_pressure || valid_pressure(&ob["botPressure"]))
}
pub fn build_prompt(snapshot: &Value) -> Result<String> {
    let bad = snapshot_error;
    let allowed_without = ["symbol","interval","exchange","capturedAt","candles","historyLength","parameters","indicators","comparison"];
    let allowed_with = ["symbol","interval","exchange","capturedAt","candles","historyLength","parameters","indicators","comparison","orderBook"];
    let has_ob = keys(snapshot, &allowed_with);
    if !has_ob && !keys(snapshot, &allowed_without) { return Err(bad()); }
    let symbol = snapshot["symbol"].as_str().ok_or_else(bad)?;
    let interval = snapshot["interval"].as_str().ok_or_else(bad)?;
    let now = snapshot["capturedAt"].as_u64().ok_or_else(bad)?;
    if !valid_symbol(symbol) || !valid_interval(interval) || snapshot["exchange"] != "binance" { return Err(bad()); }
    let candles = snapshot["candles"].as_array().ok_or_else(bad)?;
    let history = snapshot["historyLength"].as_u64().ok_or_else(bad)?;
    if candles.is_empty() || candles.len() > 100 || history < candles.len() as u64 || history > 1000 { return Err(bad()); }
    let seconds = match interval { "1m" => 60, "5m" => 300, "15m" => 900, "1h" => 3600, "4h" => 14400, _ => 86400 };
    let mut previous = None;
    for value in candles {
        if !keys(value, &["time","open","high","low","close","volume","closed"]) { return Err(bad()); }
        let candle: Candle = serde_json::from_value(value.clone()).map_err(|_| bad())?;
        candle.validate().map_err(|_| bad())?;
        if !candle.closed || candle.time.saturating_add(seconds).saturating_mul(1000) > now || previous.is_some_and(|t| t >= candle.time) { return Err(bad()); }
        previous = Some(candle.time);
    }
    let parameters = &snapshot["parameters"];
    if !keys(parameters, &["sma","emaFast","emaSlow","rsi","macd","bands"])
        || !["sma","emaFast","emaSlow"].iter().all(|key| parameters[key].as_u64().is_some_and(|n| (2..=200).contains(&n)))
        || parameters["rsi"] != 14 || parameters["macd"] != json!([12,26,9]) || parameters["bands"] != json!([20,2]) { return Err(bad()); }
    let indicators = &snapshot["indicators"];
    if !keys(indicators, &["sma","emaFast","emaSlow","rsi","macd","macdSignal","macdHistogram","bandUpper","bandMiddle","bandLower"])
        || !indicators.as_object().unwrap().values().all(|v| v.is_null() || v.as_f64().is_some_and(f64::is_finite))
        || !valid_comparison(&snapshot["comparison"], symbol, now) { return Err(bad()); }
    if has_ob && !valid_orderbook(&snapshot["orderBook"]) { return Err(bad()); }
    let prompt = format!("Analise somente os dados públicos de mercado a seguir. Responda em português, somente com um objeto JSON conforme o esquema. Não use ferramentas, arquivos, rede adicional ou comandos. Não execute operações financeiras. Descreva tendência observada, evidências com valores, cenários condicionais, riscos e limitações. Não invente probabilidades nem certezas sobre preços futuros. Dados insuficientes e aquecimento nulo devem ser explicitados. A comparação usa últimos negócios, não ofertas executáveis; não inclui taxas, liquidez ou transferências. Se fornecido o orderBook (livro de ofertas e detector de robôs), considere se os robôs estão forçando o preço para cima ou para baixo, as paredes de liquidez dos market makers, o balanceamento de pressão institucional e indícios de spoofing ou HFT no curto prazo.\nESQUEMA:\n{}\nSNAPSHOT:\n{}", analysis_schema(), snapshot);
    if prompt.len() > 64 * 1024 { return Err(AppError::new("prompt_limit", "O snapshot excedeu o limite de 64 KiB.")); }
    Ok(prompt)
}
