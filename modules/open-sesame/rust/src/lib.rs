//! Open Sesame as a Tauri 2 plugin.
//!
//! Frontend invokes commands via `invoke('plugin:open-sesame|<command>', ...)`.
//! State (DB connection, file watchers) is managed inside the plugin via
//! `app.manage::<AppState>()` so it stays isolated from other modules.

pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod providers;
pub mod services;
pub mod state;
pub mod utils;

pub use db::migrations;
pub use error::{AppError, AppResult};
pub use state::AppState;
pub use utils::paths;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Wry};

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("open-sesame")
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_github_start,
            commands::auth::auth_github_poll,
            commands::auth::auth_list_accounts,
            commands::auth::auth_logout,
            commands::workspace::workspace_list,
            commands::workspace::workspace_create,
            commands::workspace::workspace_update,
            commands::workspace::workspace_delete,
            commands::doc_set::doc_set_detect_strategy,
            commands::doc_set::doc_set_create,
            commands::doc_set::doc_set_list,
            commands::doc_set::doc_set_list_all,
            commands::doc_set::doc_set_delete,
            commands::doc_set::doc_set_move,
            commands::doc_set::doc_set_set_auto_sync,
            commands::doc_set::doc_set_setup_github_remote,
            commands::doc_set::doc_set_import_from_github,
            commands::doc_set::doc_set_sources,
            commands::doc_set::doc_set_mapping_preflight,
            commands::doc_set::doc_set_set_source_mapping,
            commands::doc_set::doc_set_add_source,
            commands::doc_set::doc_set_add_mirror_source,
            commands::doc_set::doc_set_remove_new_mirror_path,
            commands::doc_set::doc_set_refresh_mirror,
            commands::doc_set::doc_set_restore_local_from_mirror,
            commands::doc_set::doc_set_keep_both_local_changes,
            commands::doc_set::doc_set_watch_start,
            commands::doc_set::doc_set_watch_stop,
            commands::doc_set::config_export,
            commands::doc_set::config_import,
            commands::sync::sync_up,
            commands::sync::sync_down,
            commands::sync::sync_force_push,
            commands::sync::sync_force_pull,
            commands::sync::sync_status,
            commands::sync::sync_logs,
            commands::files::file_tree,
            commands::files::file_content,
            commands::files::file_search,
            commands::files::file_toggle_bookmark,
            commands::files::file_list_bookmarks,
            commands::files::write_text_file,
            commands::files::read_text_file,
        ])
        .setup(|app, _api| {
            log::info!("open-sesame plugin: initializing");

            let db_path = paths::db_path().map_err(|e| format!("open-sesame: db path: {e}"))?;
            log::info!("open-sesame db at {}", db_path.display());

            let conn = rusqlite::Connection::open(&db_path)
                .map_err(|e| format!("open-sesame: open db: {e}"))?;
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
                .map_err(|e| format!("open-sesame: pragmas: {e}"))?;
            migrations::run_migrations(&conn)
                .map_err(|e| format!("open-sesame: migrations: {e}"))?;

            app.manage(AppState::new(conn));
            Ok(())
        })
        .build()
}
