//! MySSH — a Termius-style embedded SSH client, packaged as a Tauri 2 plugin.
//!
//! Frontend invokes commands via `invoke('plugin:myssh|<command>', ...)`.
//! State (the SQLite handle; later, live SSH sessions) is managed inside the
//! plugin via `app.manage::<AppState>()` so it stays isolated from other
//! modules.

pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

pub use error::{AppError, AppResult};
pub use state::AppState;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Wry};

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("myssh")
        .invoke_handler(tauri::generate_handler![
            commands::hosts::list_hosts,
            commands::hosts::create_host,
            commands::hosts::update_host,
            commands::hosts::delete_host,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::delete_group,
            commands::session::open_session,
            commands::session::send_input,
            commands::session::resize_session,
            commands::session::close_session,
            commands::snippets::list_snippets,
            commands::snippets::create_snippet,
            commands::snippets::update_snippet,
            commands::snippets::delete_snippet,
            commands::forward::list_forwards,
            commands::forward::create_forward,
            commands::forward::delete_forward,
            commands::forward::start_forward,
            commands::forward::stop_forward,
        ])
        .on_window_ready(|window| {
            // The plugin's state outlives the module window, so if the MySSH
            // window is closed with live sessions/forwards their SSH connections
            // and listening sockets would keep running in the launcher process.
            // Tear them down when the window is destroyed.
            if window.label() != "myssh" {
                return;
            }
            let app = window.app_handle().clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    if let Some(state) = app.try_state::<AppState>() {
                        let sessions = state.sessions.clone();
                        let forwards = state.forwards.clone();
                        tauri::async_runtime::spawn(async move {
                            // Dropping the senders makes each session task see a
                            // closed channel and shut its russh handle down.
                            sessions.lock().await.clear();
                            let mut fwd = forwards.lock().await;
                            for (_, handle) in fwd.drain() {
                                handle.stop();
                            }
                            log::info!("myssh: tore down sessions + forwards on window close");
                        });
                    }
                }
            });
        })
        .setup(|app, _api| {
            log::info!("myssh plugin: initializing");
            let conn = db::open().map_err(|e| format!("myssh: open db: {e}"))?;
            app.manage(AppState::new(conn));
            Ok(())
        })
        .build()
}
