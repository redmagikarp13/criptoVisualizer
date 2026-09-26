use std::{io::{Read, Write}, time::Duration};
fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("--help") => { println!("--print --input-format --output-format --mode --sandbox --disable-slash-commands --json-schema --print-timeout --model"); }
        // Modo análise: o primeiro argumento real do protocolo stream-json.
        Some("--input-format") => {
            let mut input = String::new(); std::io::stdin().read_to_string(&mut input).unwrap();
            assert_eq!(input.lines().count(), 1);
            let event: serde_json::Value = serde_json::from_str(&input).unwrap();
            assert_eq!(event["event"], "user");
            assert!(event["message"]["content"].as_str().unwrap().contains("BTCUSDT"));
            println!("{}", serde_json::json!({"event":"result","model":"modelo-simulado","result":{"status":"SUCCESS","structured_output":{"summary":"Mercado lateral","trend":"lateral","evidence":["RSI neutro"],"scenarios":[{"condition":"Se romper","interpretation":"Reavaliar"}],"risks":["Volatilidade"],"limitations":["Sem notícias"]}}}));
        }
        Some("echo") => { let mut input = String::new(); std::io::stdin().read_to_string(&mut input).unwrap(); print!("{}|{}", input, args.get(2).map(String::as_str).unwrap_or("")); }
        Some("fragmented") => { print!("primeira"); std::io::stdout().flush().unwrap(); eprint!("diagnóstico"); std::thread::sleep(Duration::from_millis(20)); print!("segunda"); }
        Some("protocol-error") => {
            println!("{{\"event\":\"error\",\"message\":\"quota exceeded\"}}");
            std::io::stdout().flush().unwrap();
            std::thread::sleep(Duration::from_secs(30));
        }
        Some("flood") => { print!("{}", "x".repeat(4096)); }
        Some("tree") => {
            let mut child = std::process::Command::new(std::env::current_exe().unwrap()).arg("descendant").spawn().unwrap();
            let _ = child.wait();
        }
        Some("descendant") => {
            std::fs::write("ready", "ready").unwrap();
            std::thread::sleep(Duration::from_millis(600));
            std::fs::write("survivor", "alive").unwrap();
        }
        Some("sleep") => { std::thread::sleep(Duration::from_secs(30)); }
        _ => std::process::exit(2),
    }
}
