use crate::error::{AppError, Result};
use std::{path::PathBuf, time::Duration, process::Stdio, sync::{Arc, atomic::{AtomicUsize, Ordering}}};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use super::tree::ProcessTree;
use tokio_util::sync::CancellationToken;

pub struct ProcessSpec { pub executable: PathBuf, pub args: Vec<String>, pub input: Vec<u8>, pub cwd: PathBuf, pub timeout: Duration, pub max_output: usize }
#[derive(Debug)]
pub struct ProcessOutput { pub stdout: Vec<u8>, pub stderr: Vec<u8> }
async fn capture(mut stream: impl AsyncRead + Unpin, total: Arc<AtomicUsize>, max: usize, mut receive: impl FnMut(&[u8]) -> Result<()> + Send) -> Result<Vec<u8>> {
    let mut output = Vec::new(); let mut chunk = [0u8; 8192];
    loop {
        let count = stream.read(&mut chunk).await.map_err(|_| AppError::new("process_io", "Falha ao ler a saída da CLI."))?;
        if count == 0 { return Ok(output); }
        if total.fetch_add(count, Ordering::Relaxed).saturating_add(count) > max { return Err(AppError::new("output_limit", "A CLI excedeu o limite de saída. A execução foi encerrada.")); }
        receive(&chunk[..count])?;
        output.extend_from_slice(&chunk[..count]);
    }
}
pub fn classify_failure(text: &str) -> AppError {
    let text = text.to_lowercase();
    if ["unauthenticated", "not logged in", "login required", "authentication required", "please login", "please log in", "unauthorized"].iter().any(|s| text.contains(s)) {
        AppError::new("login_required", "Login necessário. Autentique a CLI no terminal e tente novamente.")
    } else if ["rate limit", "quota", "usage limit", "insufficient credits", "credit balance", "resource_exhausted", "429"].iter().any(|s| text.contains(s)) {
        AppError::new("usage_limit", "Limite de uso do provedor. Verifique a cota da sua conta antes de tentar novamente.")
    } else { AppError::new("process_failed", "A CLI encerrou com erro. Verifique sua instalação e autenticação no terminal.") }
}
pub async fn execute(spec: ProcessSpec, cancel: CancellationToken) -> Result<ProcessOutput> {
    execute_stream(spec, cancel, |_| Ok(())).await
}
pub async fn execute_stream(spec: ProcessSpec, cancel: CancellationToken, receive: impl FnMut(&[u8]) -> Result<()> + Send) -> Result<ProcessOutput> {
    if cancel.is_cancelled() { return Err(AppError::new("cancelled", "Análise cancelada.")); }
    let mut tree = ProcessTree::new()?;
    let mut command = tokio::process::Command::new(&spec.executable);
    command.args(&spec.args).current_dir(&spec.cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000 | 0x00000004);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.spawn().map_err(|_| AppError::new("cli_missing", "Não foi possível iniciar o executável. Confira o caminho e as permissões."))?;
    if let Err(error) = tree.attach(&child) { let _ = child.kill().await; return Err(error); }
    let mut stdin = child.stdin.take().ok_or_else(|| AppError::new("process_io", "Entrada da CLI indisponível."))?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::new("process_io", "Saída da CLI indisponível."))?;
    let stderr = child.stderr.take().ok_or_else(|| AppError::new("process_io", "Diagnóstico da CLI indisponível."))?;
    let total = Arc::new(AtomicUsize::new(0));
    let result = {
        let operation = async {
            let input = async {
                // Fechar stdin é parte do protocolo, inclusive quando a CLI responde cedo.
                let _ = stdin.write_all(&spec.input).await;
                drop(stdin);
                Ok::<(), AppError>(())
            };
            let wait = async { child.wait().await.map_err(|_| AppError::new("process_io", "Não foi possível aguardar a CLI.")) };
            let (_, stdout, stderr, status) = tokio::try_join!(input, capture(stdout, total.clone(), spec.max_output, receive), capture(stderr, total, spec.max_output, |_| Ok(())), wait)?;
            if !status.success() {
                return Err(classify_failure(&format!("{}\n{}", String::from_utf8_lossy(&stdout), String::from_utf8_lossy(&stderr))));
            }
            Ok(ProcessOutput { stdout, stderr })
        };
        tokio::select! {
            biased;
            _ = cancel.cancelled() => Err(AppError::new("cancelled", "Análise cancelada.")),
            _ = tokio::time::sleep(spec.timeout) => Err(AppError::new("timeout", "A CLI excedeu o tempo limite. Nenhuma nova tentativa foi iniciada.")),
            result = operation => result,
        }
    };
    tree.terminate();
    let _ = child.wait().await;
    result
}
