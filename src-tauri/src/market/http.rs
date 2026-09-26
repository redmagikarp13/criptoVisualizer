use crate::error::{AppError, Result};
use serde_json::Value;
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(20)).connect_timeout(Duration::from_secs(10))
        .user_agent("CriptoVisualizer/0.1 (public-market-data)")
        .redirect(reqwest::redirect::Policy::none()).build().expect("Cliente HTTPS")
}
pub async fn get(client: &reqwest::Client, url: &str) -> Result<Value> {
    for attempt in 0..3 {
        let mut response = client.get(url).send().await.map_err(|_| AppError::new("network", "Não foi possível acessar os dados públicos. Verifique a conexão."))?;
        let status = response.status();
        if status.as_u16() == 429 || status.as_u16() == 418 {
            let seconds = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|s| s.parse::<u64>().ok()).unwrap_or(60);
            tokio::time::sleep(Duration::from_secs(seconds.max(1))).await;
            if attempt < 2 { continue; }
            return Err(AppError::new("rate_limit", "Limite da exchange atingido. Aguardando para reconectar."));
        }
        if !status.is_success() {
            return Err(AppError::new("exchange_unavailable", format!("Dados indisponíveis (HTTP {}). Pode haver restrição regional ou indisponibilidade da exchange.", status.as_u16())));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| AppError::new("network", "Resposta de mercado interrompida."))? {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 { return Err(AppError::new("invalid_data", "Resposta de mercado excessiva.")); }
            bytes.extend_from_slice(&chunk);
        }
        return serde_json::from_slice(&bytes).map_err(|_| AppError::new("invalid_data", "A exchange retornou dados inválidos."));
    }
    Err(AppError::new("network", "A exchange não respondeu."))
}
