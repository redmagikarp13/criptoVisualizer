use criptovisualizer_lib::preferences::{Preferences, Alert, load, save, valid_symbol, split_symbol};

#[test]
fn alarmes_persistem_e_validam() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("preferences.json");
    let mut p = Preferences::default();
    p.alerts = vec![Alert { id: "a".into(), symbol: "BTCUSDC".into(), direction: "above".into(), price: 70000.0, enabled: true, mode: "once".into() }];
    save(&path, &p).unwrap();
    assert_eq!(load(&path).preferences.alerts.len(), 1);
    let mut bad = Preferences::default();
    bad.alerts = vec![Alert { id: "b".into(), symbol: "BTCUSDT".into(), direction: "up".into(), price: -1.0, enabled: true, mode: "once".into() }];
    assert!(save(&path, &bad).is_err());
}

#[test]
fn aceita_cotacoes_conhecidas_e_recusa_desconhecidas() {
    assert!(valid_symbol("BTCUSDT"));
    assert!(valid_symbol("BTCUSDC"));
    assert!(valid_symbol("ETHBRL"));
    assert!(valid_symbol("XRPEURI"));
    assert!(valid_symbol("ENABTC"));
    assert!(valid_symbol("IOTABTC"));
    assert!(!valid_symbol("BTCUSD"));   // cotação "USD" simples não é usada no Spot
    assert!(!valid_symbol("BTCXYZ"));   // cotação inexistente
    assert!(!valid_symbol("BT"));       // curta demais
    assert!(!valid_symbol("btcusdt"));  // minúsculas
    assert_eq!(split_symbol("BTCUSDC"), Some(("BTC".into(), "USDC".into())));
    assert_eq!(split_symbol("BTCUSDT"), Some(("BTC".into(), "USDT".into())));
    assert_eq!(split_symbol("XRPEURI"), Some(("XRP".into(), "EURI".into())));
    assert_eq!(split_symbol("ENABTC"), Some(("ENA".into(), "BTC".into())));
    assert_eq!(split_symbol("BTCUSD"), None);

    // Ações e ativos da B3
    assert!(valid_symbol("PETR4"));
    assert!(valid_symbol("VALE3"));
    assert!(valid_symbol("BOVA11"));
    assert!(valid_symbol("MXRF11"));
    assert!(valid_symbol("PETR4F"));
    assert!(!valid_symbol("PET4"));     // 3 letras é inválido na B3
    assert!(!valid_symbol("PETR"));     // sem dígito
}

#[test]
fn preferencias_ausentes_e_corrompidas_recuperam_padrao() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("preferences.json");
    assert_eq!(load(&path).preferences.symbol, "BTCUSDT");
    std::fs::write(&path, "{inválido").unwrap();
    let result = load(&path);
    assert!(result.warning.is_some());
    assert!(!result.preferences.antigravity_enabled);
}

#[test]
fn persistencia_atomica_substitui_arquivo_anterior() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("preferences.json");
    let mut preferences = Preferences::default();
    save(&path, &preferences).unwrap();
    preferences.symbol = "ETHUSDT".into();
    save(&path, &preferences).unwrap();
    assert_eq!(load(&path).preferences.symbol, "ETHUSDT");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn rejeita_configuracao_antes_de_substituir_o_arquivo() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("preferences.json");
    save(&path, &Preferences::default()).unwrap();
    let mut bad = Preferences::default(); bad.favorites = vec!["BTCUSDT".into();21];
    assert!(save(&path, &bad).is_err());
    assert_eq!(load(&path).preferences.favorites.len(), 5);
}
