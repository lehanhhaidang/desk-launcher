//! Per-module data directory resolver.
//!
//! Modules MUST use this helper instead of calling `app.path().app_data_dir()`
//! directly. Rationale: the launcher's bundle identifier (and therefore the
//! OS-derived app data path) is owned by the launcher, not by modules. If a
//! module hard-codes its own identifier, its DB silently lives in a different
//! folder than the rest of the launcher.
//!
//! This helper resolves to the SAME directory that Tauri's
//! `app.path().app_data_dir()` would return for the launcher's bundle
//! identifier (`io.desklauncher`). On Windows that's
//! `%APPDATA%\io.desklauncher\`.
//!
//! Layout:
//! ```text
//! %APPDATA%\io.desklauncher\
//! ├── modules\
//! │   ├── comtor\        # vcomtor.db, audio\, settings.json
//! │   ├── open-sesame\   # data.db
//! │   ├── myssh\         # myssh.db
//! │   └── ...
//! └── launcher.toml      # launcher-level settings, migration markers
//! ```

use std::path::PathBuf;

/// The launcher's bundle identifier — KEEP IN SYNC with tauri.conf.json.
pub const LAUNCHER_IDENTIFIER: &str = "io.desklauncher";

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("could not resolve OS data directory")]
    NoDataDir,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Root app data dir, matching Tauri's `app_data_dir()` resolution.
///
/// Windows: `%APPDATA%\io.desklauncher\`
/// Linux:   `~/.local/share/io.desklauncher/`
/// macOS:   `~/Library/Application Support/io.desklauncher/`
pub fn launcher_data_dir() -> Result<PathBuf, PathError> {
    let base = dirs::data_dir().ok_or(PathError::NoDataDir)?;
    let path = base.join(LAUNCHER_IDENTIFIER);
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// Per-module data dir: `<launcher_data_dir>/modules/<module_id>/`.
/// Created if missing. Each module gets its own isolated subdir so modules
/// can keep separate SQLite DBs, settings, attachments, etc.
pub fn module_data_dir(module_id: &str) -> Result<PathBuf, PathError> {
    let path = launcher_data_dir()?.join("modules").join(module_id);
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// Convenience: a file within a module's data dir, parent dir auto-created.
pub fn module_data_file(module_id: &str, filename: &str) -> Result<PathBuf, PathError> {
    Ok(module_data_dir(module_id)?.join(filename))
}
