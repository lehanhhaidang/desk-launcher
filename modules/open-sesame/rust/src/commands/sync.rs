use crate::error::AppResult;
use crate::services::sync_service::{self, SyncResult};
use crate::state::AppState;

#[tauri::command]
pub async fn sync_up(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    doc_set_id: String,
    message: Option<String>,
) -> AppResult<SyncResult> {
    sync_service::sync_up(state.db.clone(), &app_handle, &doc_set_id, message).await
}

#[tauri::command]
pub async fn sync_down(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    doc_set_id: String,
) -> AppResult<SyncResult> {
    sync_service::sync_down(state.db.clone(), &app_handle, &doc_set_id).await
}

#[tauri::command]
pub async fn sync_force_push(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    doc_set_id: String,
    message: Option<String>,
) -> AppResult<SyncResult> {
    sync_service::force_push(state.db.clone(), &app_handle, &doc_set_id, message).await
}

#[tauri::command]
pub async fn sync_force_pull(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    doc_set_id: String,
) -> AppResult<SyncResult> {
    sync_service::force_pull(state.db.clone(), &app_handle, &doc_set_id).await
}

/// Get sync status — checks git repo for changes
#[tauri::command]
pub async fn sync_status(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<String> {
    let db = state.db.lock().await;
    let doc_set = crate::db::doc_set_repo::find_by_id(&db, &doc_set_id)?
        .ok_or_else(|| crate::error::AppError::NotFound("Doc set".into()))?;

    if doc_set.remote_url.is_none() {
        return Ok("setup_required".into());
    }

    let staging_path = sync_service::resolve_staging_path(&doc_set)?;
    drop(db); // Release lock before checking filesystem

    let staging = std::path::Path::new(&staging_path);
    if !staging.join(".git").exists() {
        return Ok("not_initialized".into());
    }

    // Check git status synchronously
    let repo = git2::Repository::open(&staging_path)?;
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts))?;
    let has_user_changes = statuses.iter().any(|status| {
        status
            .path()
            .map(|path| {
                let normalized = path.replace('\\', "/");
                normalized != ".open-sesame" && !normalized.starts_with(".open-sesame/")
            })
            .unwrap_or(false)
    });

    let status_str = if !has_user_changes {
        "up_to_date"
    } else {
        "local_changes"
    };

    Ok(status_str.into())
}

/// Lấy lịch sử sync
#[tauri::command]
pub async fn sync_logs(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
    limit: Option<i64>,
) -> AppResult<Vec<crate::models::sync_log::SyncLog>> {
    let db = state.db.lock().await;
    crate::db::sync_log_repo::list_recent(&db, &doc_set_id, limit.unwrap_or(20))
}
