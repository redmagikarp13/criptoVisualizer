use crate::{error::{AppError, Result}, preferences::Preferences};
use super::process::ProcessSpec;
use std::path::Path;

pub fn check_capabilities(agent: &str, help: &str, consent: bool) -> Result<()> {
    match agent {
        "qoder" => {
            // As flags de ferramentas/MCP não comprovam a exclusão de hooks e plugins.
            // Não habilitar este adaptador apenas pela presença de --settings no help.
            Err(AppError::new("cli_incompatible", "Qoder detectado, mas o bloqueio de hooks/plugins pessoais ainda não foi validado nesta integração. Execução bloqueada por segurança."))
        }
        "antigravity" => {
            if !consent { return Err(AppError::new("consent_required", "Habilite Antigravity nas configurações após ler o aviso de permissões.")); }
            let required = ["--print", "--input-format", "--output-format", "--mode", "--sandbox", "--disable-slash-commands", "--json-schema", "--print-timeout"];
            if !required.iter().all(|flag| help.split_whitespace().any(|word| word == *flag)) {
                return Err(AppError::new("cli_incompatible", "Esta versão do Antigravity não oferece todas as opções exigidas. Atualize a CLI pelo terminal."));
            }
            Ok(())
        }
        _ => Err(AppError::new("invalid_agent", "Agente não suportado.")),
    }
}
pub fn analysis_spec(agent: &str, path: &Path, cwd: &Path, prompt: &str, preferences: &Preferences, help: &str) -> Result<ProcessSpec> {
    preferences.validate()?;
    check_capabilities(agent, help, preferences.antigravity_enabled)?;
    if prompt.len() > 64 * 1024 { return Err(AppError::new("prompt_limit", "Prompt excede 64 KiB.")); }
    // Em stream-json a CLI lê prompts do stdin; --print exige um argumento e abortaria.
    let mut args: Vec<String> = ["--input-format", "stream-json", "--output-format", "stream-json", "--mode", "plan", "--sandbox", "--disable-slash-commands", "--print-timeout", "180s", "--json-schema"].iter().map(|s| (*s).into()).collect();
    args.push(super::protocol::analysis_schema().to_string());
    if !preferences.antigravity_model.is_empty() {
        if !help.split_whitespace().any(|s| s == "--model") { return Err(AppError::new("cli_incompatible", "Esta CLI não aceita seleção de modelo.")); }
        args.extend(["--model".into(), preferences.antigravity_model.clone()]);
    }
    let input = format!("{}\n", serde_json::json!({"event":"user","message":{"content":prompt}})).into_bytes();
    Ok(ProcessSpec { executable: path.into(), cwd: cwd.into(), args, input, timeout: std::time::Duration::from_secs(180), max_output: 2 * 1024 * 1024 })
}
