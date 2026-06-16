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
        ])
        .setup(|app, _api| {
            log::info!("myssh plugin: initializing");
            let conn = db::open().map_err(|e| format!("myssh: open db: {e}"))?;
            app.manage(AppState::new(conn));
            Ok(())
        })
        .build()
}
