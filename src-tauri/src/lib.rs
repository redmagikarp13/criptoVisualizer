pub mod ai;
pub mod error;
pub mod market;
pub mod preferences;

use error::{AppError, Result};
use market::types::{Instrument, MarketRequest, Message};
use preferences::{LoadedPreferences, Preferences};
use std::{path::PathBuf, sync::{Arc, Mutex}, time::{Duration, Instant}};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};

struct AppState {
    preference_path: PathBuf,
    preferences: Mutex<Preferences>,
    market: market::MarketHub,
    client: reqwest::Client,
    catalog: tokio::sync::Mutex<Option<(Instant, Vec<Instrument>)>>,
    ai_directory: PathBuf,
    analysis: Arc<ai::hub::AnalysisHub>,
    detection: Arc<ai::hub::AnalysisHub>,
    detection_queue: tokio::sync::Mutex<()>,
    shutdown_started: std::sync::atomic::AtomicBool,
}
#[tauri::command]
fn load_preferences(state: State<'_, AppState>) -> LoadedPreferences { preferences::load(&state.preference_path) }
#[tauri::command]
fn save_preferences(preferences: Preferences, state: State<'_, AppState>) -> Result<()> {
    let mut current = state.preferences.lock().map_err(|_| AppError::new("internal", "Preferências ocupadas."))?;
    preferences::save(&state.preference_path, &preferences)?;
    *current = preferences;
    Ok(())
}
#[tauri::command]
async fn list_instruments(state: State<'_, AppState>) -> Result<Vec<Instrument>> {
    let mut cache = state.catalog.lock().await;
    if let Some((time, instruments)) = cache.as_ref() {
        if time.elapsed() < Duration::from_secs(3600) { return Ok(instruments.clone()); }
    }
    let instruments = market::binance::instruments(&state.client).await?;
    *cache = Some((Instant::now(), instruments.clone()));
    Ok(instruments)
}
#[tauri::command]
fn start_market(request: MarketRequest, window: tauri::WebviewWindow, state: State<'_, AppState>) -> Result<()> {
    let id = request.id.clone();
    let sink = Arc::new(move |event| { let _ = window.emit("market-event", Message { id: id.clone(), event }); });
    state.market.start(state.client.clone(), request, sink)
}
#[tauri::command]
fn stop_market(id: String, state: State<'_, AppState>) { state.market.stop(Some(&id)); }

#[tauri::command]
async fn detect_cli(preferences: Preferences, state: State<'_, AppState>) -> Result<Vec<ai::CliStatus>> {
    preferences.validate()?;
    let _queue = state.detection_queue.lock().await;
    let lease = state.detection.reserve("detection")?;
    Ok(ai::detect(&preferences, &state.ai_directory, lease.token.clone()).await)
}
#[tauri::command]
async fn analyze_market(id: String, agent: String, snapshot: serde_json::Value, state: State<'_, AppState>) -> Result<ai::protocol::AnalysisOutput> {
    let lease = state.analysis.reserve(&id)?;
    let preferences = state.preferences.lock().map_err(|_| AppError::new("internal", "Preferências ocupadas."))?.clone();
    ai::analyze(&agent, &preferences, &snapshot, &state.ai_directory, lease.token.clone()).await
}
#[tauri::command]
fn cancel_analysis(id: String, state: State<'_, AppState>) { state.analysis.cancel(Some(&id)); }

#[tauri::command]
async fn search_br_stocks(
    query: String,
    token: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<market::brapi::BrStockSearchResult>> {
    market::brapi::search_stocks(&state.client, &query, token.as_deref()).await
}

#[tauri::command]
async fn fetch_br_quotes(
    tickers: Vec<String>,
    token: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<market::brapi::BrStockQuote>> {
    market::brapi::fetch_quotes(&state.client, &tickers, token.as_deref()).await
}

#[tauri::command]
async fn fetch_br_stock_candles(
    ticker: String,
    token: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<market::types::Candle>> {
    market::brapi::fetch_stock_candles(&state.client, &ticker, token.as_deref()).await
}

#[tauri::command]
fn notify(title: String, message: String) {
    #[cfg(target_os = "macos")]
    {
        let escaped_title = title.replace('\\', "\\\\").replace('\"', "\\\"");
        let escaped_msg = message.replace('\\', "\\\\").replace('\"', "\\\"");
        let script = format!(
            "display notification \"{}\" with title \"{}\" sound name \"Glass\"",
            escaped_msg, escaped_title
        );
        let _ = std::process::Command::new("osascript").arg("-e").arg(script).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, message);
    }
}

#[tauri::command]
fn update_tray(title: String, app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_title(Some(&title));
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, app);
    }
}

#[tauri::command]
async fn fetch_derivatives_data(
    symbol: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value> {
    market::binance::fetch_futures_data(&state.client, &symbol).await
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("CriptoVisualizer")
        .inner_size(1440.0, 900.0)
        .min_inner_size(1024.0, 700.0)
        .background_color(tauri::window::Color(11, 15, 25, 255))
        .build();
    }
    if let Some(widget) = app.get_webview_window("widget") {
        let _ = widget.hide();
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

static LAST_WIDGET_UNFOCUS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn toggle_widget_window(app: &tauri::AppHandle, rect: &tauri::Rect) {
    if let Some(widget) = app.get_webview_window("widget") {
        let now = current_time_ms();
        let last_unfocus = LAST_WIDGET_UNFOCUS.load(std::sync::atomic::Ordering::SeqCst);
        if now.saturating_sub(last_unfocus) < 250 {
            return;
        }

        let is_visible = widget.is_visible().unwrap_or(false);
        if is_visible {
            let _ = widget.hide();
        } else {
            let scale_factor = widget.scale_factor().unwrap_or(1.0);
            let icon_pos = rect.position.to_logical::<f64>(scale_factor);
            let icon_size = rect.size.to_logical::<f64>(scale_factor);

            let monitors = app.available_monitors().unwrap_or_default();
            let monitor = monitors.into_iter().find(|m| {
                let m_scale = m.scale_factor();
                let m_pos = m.position().to_logical::<f64>(m_scale);
                let m_size = m.size().to_logical::<f64>(m_scale);
                icon_pos.x >= m_pos.x && icon_pos.x <= (m_pos.x + m_size.width)
            }).or_else(|| widget.current_monitor().ok().flatten())
              .or_else(|| widget.primary_monitor().ok().flatten());

            let widget_width = 380.0;
            let widget_height = 520.0;
            let margin = 8.0;

            let mut target_x = if icon_size.width > 0.0 {
                (icon_pos.x + icon_size.width / 2.0) - (widget_width / 2.0)
            } else {
                icon_pos.x - (widget_width / 2.0)
            };

            let bar_height = if icon_size.height > 0.0 { icon_size.height } else { 24.0 };
            let mut target_y = icon_pos.y + bar_height + 4.0;

            if let Some(m) = monitor {
                let m_scale = m.scale_factor();
                let m_pos = m.position().to_logical::<f64>(m_scale);
                let m_size = m.size().to_logical::<f64>(m_scale);

                if icon_pos.x == 0.0 && icon_size.width == 0.0 {
                    target_x = m_pos.x + m_size.width - widget_width - 20.0;
                    target_y = m_pos.y + 30.0;
                } else {
                    let min_x = m_pos.x + margin;
                    let max_x = m_pos.x + m_size.width - widget_width - margin;
                    if max_x >= min_x {
                        target_x = target_x.clamp(min_x, max_x);
                    }

                    let min_y = m_pos.y;
                    let max_y = m_pos.y + m_size.height - widget_height - margin;
                    if max_y >= min_y {
                        target_y = target_y.clamp(min_y, max_y);
                    }
                }
            }

            let _ = widget.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: target_x,
                y: target_y,
            }));
            let _ = widget.show();
            let _ = widget.set_focus();
        }
    }
}

fn shutdown(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.market.stop(None);
    state.analysis.close();
    state.detection.close();
    let busy = state.analysis.is_busy() || state.detection.is_busy();
    if busy && !state.shutdown_started.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let analysis = state.analysis.clone();
        let detection = state.detection.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::join!(analysis.wait_idle(), detection.wait_idle());
            app.exit(0);
        });
    }
    busy
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let preference_path = directory.join("preferences.json");
            let ai_directory = directory.join("agent-workspace");
            std::fs::create_dir_all(&ai_directory)?;
            let preferences = preferences::load(&preference_path).preferences;
            app.manage(AppState {
                preference_path, preferences: Mutex::new(preferences), market: market::MarketHub::default(),
                client: market::http::client(), catalog: tokio::sync::Mutex::new(None), ai_directory,
                analysis: Arc::default(), detection: Arc::default(), detection_queue: tokio::sync::Mutex::new(()),
                shutdown_started: std::sync::atomic::AtomicBool::new(false),
            });

            let icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("CriptoVisualizer")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                        toggle_widget_window(tray.app_handle(), &rect);
                    }
                });

            if let Some(i) = icon {
                tray_builder = tray_builder.icon(i);
            }

            #[cfg(target_os = "macos")]
            {
                tray_builder = tray_builder.title("CriptoVisualizer");
            }

            let _ = tray_builder.build(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "widget" {
                if let tauri::WindowEvent::Focused(false) = event {
                    LAST_WIDGET_UNFOCUS.store(current_time_ms(), std::sync::atomic::Ordering::SeqCst);
                    let _ = window.hide();
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                    return;
                }
                if window.label() == "widget" {
                    let _ = window.hide();
                    api.prevent_close();
                    return;
                }
                if shutdown(window.app_handle()) { api.prevent_close(); }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_preferences, save_preferences, list_instruments, start_market,
            stop_market, detect_cli, analyze_market, cancel_analysis,
            notify, update_tray, show_main_window, exit_app,
            search_br_stocks, fetch_br_quotes, fetch_br_stock_candles,
            fetch_derivatives_data
        ])
        .build(tauri::generate_context!())
        .expect("Não foi possível iniciar o CriptoVisualizer")
        .run(|app, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if shutdown(app) { api.prevent_exit(); }
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.unminimize();
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
                _ => {}
            }
        });
}
