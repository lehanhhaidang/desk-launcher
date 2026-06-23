//! AI Session Viewer Tauri plugin — pure Rust.
//!
//! Browses local session logs written by AI coding assistants (Claude Code,
//! Codex, …) and returns a cleaned-up conversation view. All filesystem reads
//! happen here in Rust against the user's home directory, so the module needs
//! no `fs` read permissions on the frontend side.

mod commands;
mod error;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Wry;

use commands::providers::list_providers;
use commands::sessions::{list_projects, list_sessions, read_session};

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("ai-session-viewer")
        .invoke_handler(tauri::generate_handler![
            list_providers,
            list_projects,
            list_sessions,
            read_session,
        ])
        .setup(|_app, _api| {
            log::info!("ai-session-viewer plugin initialized (Rust)");
            Ok(())
        })
        .build()
}
