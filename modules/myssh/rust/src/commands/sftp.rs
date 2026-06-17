use crate::error::{AppError, AppResult};
use crate::models::sftp::{make_preview, FilePreview, SftpEntry, SftpOpened, MAX_PREVIEW};
use crate::services::sftp;
use crate::services::ssh_client;
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn sftp_open(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<SftpOpened> {
    let params = ssh_client::resolve_params(state.db.clone(), &host_id).await?;
    let (handle, home) = sftp::open(app, &params).await?;
    let sftp_id = uuid::Uuid::new_v4().to_string();
    state.sftp.lock().await.insert(sftp_id.clone(), handle);
    Ok(SftpOpened { sftp_id, home })
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, AppState>,
    sftp_id: String,
    path: String,
) -> AppResult<Vec<SftpEntry>> {
    let map = state.sftp.lock().await;
    let handle = map
        .get(&sftp_id)
        .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?;
    sftp::list(&handle.sftp, &path).await
}

#[tauri::command]
pub async fn sftp_read_text(
    state: State<'_, AppState>,
    sftp_id: String,
    path: String,
) -> AppResult<FilePreview> {
    let map = state.sftp.lock().await;
    let handle = map
        .get(&sftp_id)
        .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?;
    let meta = handle
        .sftp
        .metadata(path.clone())
        .await
        .map_err(|e| AppError::Ssh(format!("stat: {e}")))?;
    let size = meta.size.unwrap_or(0);
    if size > MAX_PREVIEW {
        return Ok(make_preview(Vec::new(), size, true));
    }
    let bytes = handle
        .sftp
        .read(path)
        .await
        .map_err(|e| AppError::Ssh(format!("read: {e}")))?;
    Ok(make_preview(bytes, size, false))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn sftp_download(
    app: AppHandle,
    state: State<'_, AppState>,
    sftp_id: String,
    transfer_id: String,
    name: String,
    remote_path: String,
    local_path: String,
    is_dir: bool,
) -> AppResult<()> {
    let sftp = {
        let map = state.sftp.lock().await;
        map.get(&sftp_id)
            .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?
            .sftp
            .clone()
    };
    sftp::download_progress(app, transfer_id, name, &sftp, remote_path, local_path, is_dir).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn sftp_upload(
    app: AppHandle,
    state: State<'_, AppState>,
    sftp_id: String,
    transfer_id: String,
    name: String,
    local_path: String,
    remote_path: String,
    is_dir: bool,
) -> AppResult<()> {
    let sftp = {
        let map = state.sftp.lock().await;
        map.get(&sftp_id)
            .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?
            .sftp
            .clone()
    };
    sftp::upload_progress(app, transfer_id, name, &sftp, local_path, remote_path, is_dir).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, AppState>,
    sftp_id: String,
    path: String,
) -> AppResult<()> {
    let map = state.sftp.lock().await;
    let handle = map
        .get(&sftp_id)
        .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?;
    handle
        .sftp
        .create_dir(path)
        .await
        .map_err(|e| AppError::Ssh(format!("mkdir: {e}")))
}

#[tauri::command]
pub async fn sftp_remove(
    state: State<'_, AppState>,
    sftp_id: String,
    path: String,
    is_dir: bool,
) -> AppResult<()> {
    let map = state.sftp.lock().await;
    let handle = map
        .get(&sftp_id)
        .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?;
    let result = if is_dir {
        handle.sftp.remove_dir(path).await
    } else {
        handle.sftp.remove_file(path).await
    };
    result.map_err(|e| AppError::Ssh(format!("remove: {e}")))
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, AppState>,
    sftp_id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    let map = state.sftp.lock().await;
    let handle = map
        .get(&sftp_id)
        .ok_or_else(|| AppError::NotFound(format!("sftp session {sftp_id}")))?;
    handle
        .sftp
        .rename(from, to)
        .await
        .map_err(|e| AppError::Ssh(format!("rename: {e}")))
}

#[tauri::command]
pub async fn sftp_close(state: State<'_, AppState>, sftp_id: String) -> AppResult<()> {
    state.sftp.lock().await.remove(&sftp_id);
    Ok(())
}
