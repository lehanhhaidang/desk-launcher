//! Paths for the open-sesame module.
//!
//! DB lives under the launcher's per-module data dir
//! (`%APPDATA%\com.lehanhhaidang.desklauncher\modules\open-sesame\`).
//!
//! Git mirrors stay at `~/.open-sesame/mirrors/` per the migration plan:
//! mirrors can be large git working copies, so we leave them where they
//! are to avoid I/O and possibly breaking git remote URLs.

use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// Per-module data dir: `%APPDATA%\com.lehanhhaidang.desklauncher\modules\open-sesame\`.
pub fn app_data_dir() -> AppResult<PathBuf> {
    launcher_paths::module_data_dir("open-sesame")
        .map_err(|e| AppError::Internal(format!("module data dir: {e}")))
}

/// SQLite DB: `<app_data_dir>/data.db`.
pub fn db_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("data.db"))
}

/// Git mirrors live at `~/.open-sesame/mirrors/`. Intentionally separate
/// from the launcher's APPDATA — see module-level doc.
pub fn mirrors_dir() -> AppResult<PathBuf> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Internal("Cannot find home directory".into()))?;
    let dir = home.join(".open-sesame").join("mirrors");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Per-doc-set mirror dir: `~/.open-sesame/mirrors/<doc_set_id>/`.
pub fn mirror_path(doc_set_id: &str) -> AppResult<PathBuf> {
    let dir = mirrors_dir()?.join(doc_set_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mirror_path_created() {
        let path = mirror_path("test-doc-set-id").unwrap();
        assert!(path.exists());
        assert!(path.ends_with("test-doc-set-id"));
    }
}
