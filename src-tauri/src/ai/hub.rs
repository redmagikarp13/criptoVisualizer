use crate::error::{AppError, Result};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct AnalysisHub { current: Mutex<Option<(String, CancellationToken)>>, closing: std::sync::atomic::AtomicBool }
pub struct AnalysisLease { hub: Arc<AnalysisHub>, pub token: CancellationToken }
impl AnalysisHub {
    pub fn reserve(self: &Arc<Self>, id: &str) -> Result<AnalysisLease> {
        let mut current = self.current.lock().unwrap_or_else(|e| e.into_inner());
        if self.closing.load(std::sync::atomic::Ordering::SeqCst) { return Err(AppError::new("closing", "O aplicativo está encerrando.")); }
        if id.is_empty() || id.len() > 128 { return Err(AppError::new("invalid_id", "Identificador de análise inválido.")); }
        if current.is_some() { return Err(AppError::new("busy", "Já existe uma análise em execução. Aguarde ou cancele.")); }
        let token = CancellationToken::new();
        *current = Some((id.into(), token.clone()));
        Ok(AnalysisLease { hub: self.clone(), token })
    }
    pub fn cancel(&self, id: Option<&str>) {
        if let Some((current_id, token)) = self.current.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            if id.is_none() || id == Some(current_id.as_str()) { token.cancel(); }
        }
    }
    pub fn is_busy(&self) -> bool { self.current.lock().unwrap_or_else(|e| e.into_inner()).is_some() }
    pub fn close(&self) { self.closing.store(true, std::sync::atomic::Ordering::SeqCst); self.cancel(None); }
    pub async fn wait_idle(&self) { while self.is_busy() { tokio::time::sleep(std::time::Duration::from_millis(20)).await; } }
}
impl Drop for AnalysisLease { fn drop(&mut self) { self.hub.current.lock().unwrap_or_else(|e| e.into_inner()).take(); } }
