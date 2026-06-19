//! Local filesystem browsing for the dual-pane file manager. Rust has direct
//! disk access, so no extra Tauri capability is needed.

use crate::error::{AppError, AppResult};
use crate::models::sftp::{make_preview, FilePreview, SftpEntry, MAX_PREVIEW};

#[tauri::command]
pub fn local_home() -> AppResult<String> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| AppError::Internal("could not resolve home directory".into()))
}

/// Available filesystem roots (Windows drive letters; `/` elsewhere).
#[tauri::command]
pub fn local_roots() -> Vec<String> {
    let mut roots = Vec::new();
    for c in b'A'..=b'Z' {
        let path = format!("{}:\\", c as char);
        if std::path::Path::new(&path).exists() {
            roots.push(path);
        }
    }
    if roots.is_empty() {
        roots.push("/".to_string());
    }
    roots
}

#[tauri::command]
pub fn local_list(path: String) -> AppResult<Vec<SftpEntry>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&path)?.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);
        out.push(SftpEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            is_symlink: meta.file_type().is_symlink(),
            size: meta.len(),
            modified,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
pub fn local_mkdir(path: String) -> AppResult<()> {
    std::fs::create_dir(&path)?;
    Ok(())
}

#[tauri::command]
pub fn local_rename(from: String, to: String) -> AppResult<()> {
    std::fs::rename(&from, &to)?;
    Ok(())
}

#[tauri::command]
pub fn local_remove(path: String, is_dir: bool) -> AppResult<()> {
    if is_dir {
        std::fs::remove_dir_all(&path)?;
    } else {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn local_read_text(path: String) -> AppResult<FilePreview> {
    let meta = std::fs::metadata(&path)?;
    let size = meta.len();
    if size > MAX_PREVIEW {
        return Ok(make_preview(Vec::new(), size, true));
    }
    Ok(make_preview(std::fs::read(&path)?, size, false))
}
