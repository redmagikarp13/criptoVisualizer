pub mod protocol;
pub mod process;
mod tree;
pub mod provider;
pub mod hub;

use crate::{error::{AppError, Result}, preferences::Preferences};
use std::{path::{Path, PathBuf}, time::Duration};
use tokio_util::sync::CancellationToken;

#[derive(Debug, serde::Serialize)]
pub struct CliStatus { pub agent: String, pub available: bool, pub path: Option<String>, pub message: String }

fn executable(agent: &str, preferences: &Preferences) -> Result<PathBuf> {
    let (name, manual) = match agent {
        "qoder" => ("qodercli", &preferences.qoder_path),
        "antigravity" => ("agy", &preferences.antigravity_path),
        _ => return Err(AppError::new("invalid_agent", "Agente desconhecido.")),
    };
    let usable = |path: &Path| {
        if !path.is_absolute() || !path.is_file() { return None; }
        // Scripts .cmd/.bat poderiam acionar o shell implicitamente no Windows.
        #[cfg(windows)]
        if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")) { return None; }
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt;
          if std::fs::metadata(path).ok()?.permissions().mode() & 0o111 == 0 { return None; }
        }
        std::fs::canonicalize(path).ok()
    };
    if !manual.is_empty() {
        return usable(Path::new(manual)).ok_or_else(|| AppError::new("cli_missing", "Selecione o caminho completo de um executável válido, sem argumentos ou aspas."));
    }
    if let Ok(path) = which::which(name) {
        if let Some(path) = usable(&path) { return Ok(path); }
    }
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        candidates.push(home.join(format!(".qoder/bin/qodercli/{name}{}", std::env::consts::EXE_SUFFIX)));
        candidates.push(home.join(format!(".local/bin/{name}{}", std::env::consts::EXE_SUFFIX)));
    }
    #[cfg(windows)]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join(format!("agy/bin/{name}.exe")));
    }
    #[cfg(unix)]
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] { candidates.push(Path::new(dir).join(name)); }
    candidates.iter().find_map(|path| usable(path)).ok_or_else(|| AppError::new("cli_missing", "CLI não encontrada. Informe o executável nas configurações."))
}

async fn help(path: &Path, cwd: &Path, cancel: CancellationToken) -> Result<String> {
    let output = process::execute(process::ProcessSpec {
        executable: path.into(), args: vec!["--help".into()], input: Vec::new(), cwd: cwd.into(),
        timeout: Duration::from_secs(10), max_output: 256 * 1024,
    }, cancel).await?;
    let text = String::from_utf8(output.stdout).map_err(|_| AppError::new("cli_incompatible", "A ajuda da CLI não está em UTF-8."))?;
    Ok(format!("{text}\n{}", String::from_utf8_lossy(&output.stderr)))
}

fn ensure_consent(agent: &str, preferences: &Preferences) -> Result<()> {
    match agent {
        "antigravity" if preferences.antigravity_enabled => Ok(()),
        _ => provider::check_capabilities(agent, "", preferences.antigravity_enabled),
    }
}

pub async fn detect(preferences: &Preferences, cwd: &Path, cancel: CancellationToken) -> Vec<CliStatus> {
    let mut statuses = Vec::new();
    for agent in ["qoder", "antigravity"] {
        let mut status = CliStatus { agent: agent.into(), available: false, path: None, message: String::new() };
        let checked = async {
            preferences.validate()?;
            let path = executable(agent, preferences)?;
            status.path = Some(path.to_string_lossy().into_owned());
            ensure_consent(agent, preferences)?;
            let text = help(&path, cwd, cancel.clone()).await?;
            provider::check_capabilities(agent, &text, preferences.antigravity_enabled)
        }.await;
        match checked {
            Ok(()) => { status.available = true; status.message = "CLI disponível. Login e cota serão verificados ao solicitar uma análise.".into(); }
            Err(error) => status.message = error.message,
        }
        statuses.push(status);
    }
    statuses
}

pub async fn analyze(agent: &str, preferences: &Preferences, snapshot: &serde_json::Value, cwd: &Path, cancel: CancellationToken) -> Result<protocol::AnalysisOutput> {
    if cancel.is_cancelled() { return Err(AppError::new("cancelled", "Análise cancelada.")); }
    preferences.validate()?;
    ensure_consent(agent, preferences)?;
    let prompt = protocol::build_prompt(snapshot)?;
    let path = executable(agent, preferences)?;
    let text = help(&path, cwd, cancel.clone()).await?;
    let spec = provider::analysis_spec(agent, &path, cwd, &prompt, preferences, &text)?;
    let mut stream = protocol::AntigravityStream::default();
    process::execute_stream(spec, cancel, |bytes| stream.feed(bytes)).await?;
    stream.finish()
}
