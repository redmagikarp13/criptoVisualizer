use criptovisualizer_lib::ai::{protocol::{parse_qoder, parse_antigravity, validate_analysis, build_prompt}, process::{execute, ProcessSpec}};
use serde_json::json;
use std::{path::PathBuf, time::Duration};
use tokio_util::sync::CancellationToken;

const AGY_HELP: &str = "--print --input-format --output-format --mode --sandbox --disable-slash-commands --json-schema --print-timeout --model";
#[test]
fn provedor_exige_consentimento_e_capacidades_sem_reduzir_protecoes() {
    use criptovisualizer_lib::ai::provider::check_capabilities;
    assert_eq!(check_capabilities("antigravity", AGY_HELP, false).unwrap_err().code, "consent_required");
    assert!(check_capabilities("antigravity", "--print", true).is_err());
    assert!(check_capabilities("antigravity", AGY_HELP, true).is_ok());
    assert!(check_capabilities("qoder", "--tools --strict-mcp-config --settings --setting-sources", true).is_err());
    assert!(check_capabilities("shell", AGY_HELP, true).is_err());
}
#[test]
fn antigravity_envia_um_evento_user_e_argumentos_restritos() {
    use criptovisualizer_lib::{ai::provider::analysis_spec, preferences::Preferences};
    let preferences = Preferences { antigravity_enabled: true, ..Preferences::default() };
    let command = analysis_spec("antigravity", std::path::Path::new("agy"), std::path::Path::new("."), "Dados públicos", &preferences, AGY_HELP).unwrap();
    let input: serde_json::Value = serde_json::from_slice(&command.input).unwrap();
    assert_eq!(input, json!({"event":"user","message":{"content":"Dados públicos"}}));
    // No modo stream-json a CLI escuta prompts em stdin; --print sem valor faz a CLI abortar com exit 2.
    assert!(!command.args.iter().any(|s| s == "--print" || s == "-p" || s == "--prompt"));
    assert!(command.args.windows(2).any(|w| w == ["--mode", "plan"]));
    assert!(command.args.contains(&"--sandbox".into()));
    assert!(!command.args.iter().any(|s| s.contains("skip-permissions")));
    assert_eq!(command.timeout, Duration::from_secs(180));
    assert_eq!(command.max_output, 2 * 1024 * 1024);
}
#[test]
fn uma_analise_por_vez_inclusive_durante_cancelamento() {
    use criptovisualizer_lib::ai::hub::AnalysisHub;
    let hub = std::sync::Arc::new(AnalysisHub::default());
    let lease = hub.reserve("primeira").unwrap();
    assert!(hub.is_busy());
    assert!(hub.reserve("segunda").is_err());
    hub.cancel(Some("outra")); assert!(!lease.token.is_cancelled());
    hub.cancel(Some("primeira")); assert!(lease.token.is_cancelled());
    assert!(hub.reserve("segunda").is_err());
    drop(lease); assert!(!hub.is_busy());
    let second = hub.reserve("segunda").unwrap();
    hub.close(); assert!(second.token.is_cancelled());
    drop(second); assert!(hub.reserve("terceira").is_err());
}
#[tokio::test]
async fn integra_deteccao_prompt_e_resultado_sem_consumir_ia() {
    use criptovisualizer_lib::{ai, preferences::Preferences};
    let dir = tempfile::tempdir().unwrap();
    let preferences = Preferences { antigravity_enabled: true, antigravity_path: env!("CARGO_BIN_EXE_fake-agent").into(), qoder_path: "ausente.exe".into(), ..Preferences::default() };
    let statuses = ai::detect(&preferences, dir.path(), CancellationToken::new()).await;
    assert!(statuses.iter().any(|s| s.agent == "antigravity" && s.available));
    assert!(statuses.iter().any(|s| s.agent == "qoder" && !s.available));
    let snapshot = json!({"symbol":"BTCUSDT","interval":"1m","exchange":"binance","capturedAt":120000,"historyLength":1,
        "candles":[{"time":60,"open":10,"high":12,"low":9,"close":11,"volume":2,"closed":true}],
        "parameters":{"sma":20,"emaFast":20,"emaSlow":50,"rsi":14,"macd":[12,26,9],"bands":[20,2]},
        "indicators":{"sma":null,"emaFast":null,"emaSlow":null,"rsi":null,"macd":null,"macdSignal":null,"macdHistogram":null,"bandUpper":null,"bandMiddle":null,"bandLower":null},"comparison":null});
    let output = ai::analyze("antigravity", &preferences, &snapshot, dir.path(), CancellationToken::new()).await.unwrap();
    assert_eq!(output.analysis["trend"], "lateral");
    assert_eq!(output.model.as_deref(), Some("modelo-simulado"));
}
#[tokio::test]
async fn deteccao_preserva_caminho_com_espacos_e_recusa_comando_livre() {
    use criptovisualizer_lib::{ai, preferences::Preferences};
    let dir = tempfile::tempdir().unwrap();
    let executable = dir.path().join(if cfg!(windows) { "agente local.exe" } else { "agente local" });
    std::fs::copy(env!("CARGO_BIN_EXE_fake-agent"), &executable).unwrap();
    let mut preferences = Preferences { antigravity_enabled: true, antigravity_path: executable.to_string_lossy().into(), qoder_path: "ausente.exe".into(), ..Preferences::default() };
    let statuses = ai::detect(&preferences, dir.path(), CancellationToken::new()).await;
    assert!(statuses.iter().any(|s| s.agent == "antigravity" && s.available && s.path.is_some()));
    preferences.antigravity_path.push_str(" --print");
    let statuses = ai::detect(&preferences, dir.path(), CancellationToken::new()).await;
    assert!(statuses.iter().all(|s| !s.available));
}
#[tokio::test]
async fn analise_nao_inicia_sem_consentimento_ou_durante_cancelamento() {
    use criptovisualizer_lib::{ai, preferences::Preferences};
    let dir = tempfile::tempdir().unwrap();
    let mut preferences = Preferences { antigravity_path: env!("CARGO_BIN_EXE_fake-agent").into(), ..Preferences::default() };
    let result = ai::analyze("antigravity", &preferences, &json!({}), dir.path(), CancellationToken::new()).await;
    assert_eq!(result.unwrap_err().code, "consent_required");
    preferences.antigravity_enabled = true;
    let token = CancellationToken::new(); token.cancel();
    let result = ai::analyze("antigravity", &preferences, &json!({}), dir.path(), token).await;
    assert_eq!(result.unwrap_err().code, "cancelled");
}
fn analysis() -> serde_json::Value {
    json!({"summary":"Mercado lateral", "trend":"lateral", "evidence":["RSI neutro"], "scenarios":[{"condition":"Se romper a faixa", "interpretation":"Reavaliar tendência"}], "risks":["Volatilidade"], "limitations":["Sem notícias"]})
}
#[test]
fn qoder_valida_conteudo_interno_e_erros_do_envelope() {
    let envelope = json!({"type":"result","subtype":"success","is_error":false,"result":analysis().to_string()});
    assert_eq!(parse_qoder(&envelope.to_string()).unwrap().analysis["trend"], "lateral");
    assert!(parse_qoder(&json!({"is_error":true,"result":analysis().to_string()}).to_string()).is_err());
    assert!(parse_qoder(r#"{"result":"não é JSON"}"#).is_err());
}
#[test]
fn antigravity_so_aceita_resultado_terminal_bem_sucedido() {
    let text = format!("{}\n{}\n", json!({"event":"step_update","text":"parcial"}), json!({"event":"result","result":{"status":"SUCCESS","structured_output":analysis()}}));
    assert_eq!(parse_antigravity(&text).unwrap().analysis["trend"], "lateral");
    assert!(parse_antigravity(&json!({"event":"result","result":{"status":"WAITING","response":analysis().to_string()}}).to_string()).is_err());
    assert!(parse_antigravity("{inválido\n").is_err());
}
#[test]
fn stream_recompoe_utf8_fragmentado_e_recusa_evento_apos_resultado() {
    use criptovisualizer_lib::ai::protocol::AntigravityStream;
    let text = format!("{}\n{}\n", json!({"event":"step_update","text":"análise"}), json!({"event":"result","model":"simulado","result":{"status":"SUCCESS","structured_output":analysis()}}));
    let mut stream = AntigravityStream::default();
    for byte in text.as_bytes() { stream.feed(&[*byte]).unwrap(); }
    let output = stream.finish().unwrap();
    assert_eq!(output.analysis["summary"], "Mercado lateral");
    assert_eq!(output.model.as_deref(), Some("simulado"));
    let mut stream = AntigravityStream::default();
    stream.feed(text.as_bytes()).unwrap();
    assert!(stream.feed(b"{\"event\":\"step_update\"}\n").is_err());
}
#[tokio::test]
async fn falha_no_protocolo_interrompe_cli_antes_do_timeout() {
    use criptovisualizer_lib::ai::{process::execute_stream, protocol::AntigravityStream};
    let mut command = spec(vec!["protocol-error".into()]); command.timeout = Duration::from_secs(2);
    let mut stream = AntigravityStream::default();
    let result = execute_stream(command, CancellationToken::new(), |bytes| stream.feed(bytes)).await;
    assert_eq!(result.unwrap_err().code, "usage_limit");
}
#[test]
fn resposta_vazia_ou_excessiva_nao_passa_na_validacao() {
    assert!(validate_analysis(&analysis()).is_ok());
    assert!(validate_analysis(&json!({"summary":"oi"})).is_err());
    let mut value = analysis(); value["summary"] = json!("a".repeat(3001));
    assert!(validate_analysis(&value).is_err());
}
#[test]
fn prompt_recusa_payload_arbitrario_ou_candle_aberto() {
    let mut snapshot = json!({"symbol":"BTCUSDT","interval":"1m","exchange":"binance","capturedAt":120000,"historyLength":1,
        "candles":[{"time":60,"open":10,"high":12,"low":9,"close":11,"volume":2,"closed":true}],
        "parameters":{"sma":20,"emaFast":20,"emaSlow":50,"rsi":14,"macd":[12,26,9],"bands":[20,2]},
        "indicators":{"sma":null,"emaFast":null,"emaSlow":null,"rsi":null,"macd":null,"macdSignal":null,"macdHistogram":null,"bandUpper":null,"bandMiddle":null,"bandLower":null},"comparison":null});
    assert!(build_prompt(&snapshot).unwrap().contains("BTCUSDT"));
    snapshot["candles"][0]["closed"] = json!(false);
    assert!(build_prompt(&snapshot).is_err());
    snapshot["candles"][0]["closed"] = json!(true);
    snapshot["personalFiles"] = json!("privado");
    assert!(build_prompt(&snapshot).is_err());
    assert!(build_prompt(&json!({"command":"execute algo"})).is_err());
    assert!(build_prompt(&json!({"symbol":"BTCUSDT","interval":"1m","exchange":"binance","capturedAt":1,"candles":[]})).is_err());

    let mut ob_snapshot = snapshot.clone();
    ob_snapshot.as_object_mut().unwrap().remove("personalFiles");
    ob_snapshot["orderBook"] = json!({
        "spread": 0.0001,
        "spreadPercent": 0.04,
        "bidPressurePercent": 60.0,
        "askPressurePercent": 40.0,
        "topBidWall": { "price": 0.25, "amount": 50000.0, "ratioToAverage": 3.2 },
        "topAskWall": null,
        "botBias": "bullish",
        "spoofDetected": false,
        "hftActive": true,
        "botPressure": {
            "direction": "pushing_up",
            "score": 75.0,
            "headline": "ROBÔS FORÇANDO ALTA 🚀",
            "tactic": "Escolta de Suporte (Laddering Bids)"
        }
    });
    assert!(build_prompt(&ob_snapshot).unwrap().contains("orderBook"));
    ob_snapshot["orderBook"]["botPressure"]["direction"] = json!("invalido");
    assert!(build_prompt(&ob_snapshot).is_err());
    ob_snapshot["orderBook"].as_object_mut().unwrap().remove("botPressure");
    assert!(build_prompt(&ob_snapshot).unwrap().contains("orderBook"));
    ob_snapshot["orderBook"]["botBias"] = json!("invalido");
    assert!(build_prompt(&ob_snapshot).is_err());
}
fn spec(args: Vec<String>) -> ProcessSpec {
    ProcessSpec { executable: PathBuf::from(env!("CARGO_BIN_EXE_fake-agent")), args, input: b"entrada".to_vec(), cwd: std::env::temp_dir(), timeout: Duration::from_secs(10), max_output: 1024 }
}
#[tokio::test]
async fn processo_recebe_stdin_sem_interpretar_metacaracteres() {
    let output = execute(spec(vec!["echo".into(), "; & $(comando)".into()]), CancellationToken::new()).await.unwrap();
    assert_eq!(String::from_utf8(output.stdout).unwrap(), "entrada|; & $(comando)");
}
#[tokio::test]
async fn captura_saida_fragmentada_e_stderr_sem_deadlock() {
    let output = execute(spec(vec!["fragmented".into()]), CancellationToken::new()).await.unwrap();
    assert_eq!(String::from_utf8(output.stdout).unwrap(), "primeirasegunda");
    assert_eq!(String::from_utf8(output.stderr).unwrap(), "diagnóstico");
}
#[tokio::test]
async fn limita_saida_e_timeout() {
    let result = execute(spec(vec!["flood".into()]), CancellationToken::new()).await;
    assert_eq!(result.unwrap_err().code, "output_limit");
    let mut command = spec(vec!["sleep".into()]); command.timeout = Duration::from_millis(150);
    assert_eq!(execute(command, CancellationToken::new()).await.unwrap_err().code, "timeout");
}
#[tokio::test]
async fn codigo_de_saida_nao_zero_nao_e_sucesso() {
    assert_eq!(execute(spec(vec!["fail".into()]), CancellationToken::new()).await.unwrap_err().code, "process_failed");
}
#[tokio::test]
async fn cancelamento_encerra_tambem_descendentes() {
    let dir = tempfile::tempdir().unwrap();
    let mut command = spec(vec!["tree".into()]); command.cwd = dir.path().into();
    let token = CancellationToken::new(); let trigger = token.clone();
    let task = tokio::spawn(execute(command, token));
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while !dir.path().join("ready").exists() && !task.is_finished() && std::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    trigger.cancel();
    let result = task.await.unwrap();
    assert!(dir.path().join("ready").exists(), "O descendente precisa ter iniciado para provar o encerramento");
    assert_eq!(result.unwrap_err().code, "cancelled");
    tokio::time::sleep(Duration::from_millis(750)).await;
    assert!(!dir.path().join("survivor").exists(), "O descendente sobreviveu ao cancelamento");
}
#[tokio::test]
async fn cancelamento_encerra_o_processo() {
    let token = CancellationToken::new(); let trigger = token.clone();
    tokio::spawn(async move { tokio::time::sleep(Duration::from_millis(150)).await; trigger.cancel(); });
    assert_eq!(execute(spec(vec!["sleep".into()]), token).await.unwrap_err().code, "cancelled");
}
