use crate::db::host_repo;
use crate::error::{AppError, AppResult};
use crate::services::ssh_client::{self, SessionRequest};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn open_session(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<String> {
    let params = ssh_client::resolve_params(state.db.clone(), &host_id).await?;

    let session_id = uuid::Uuid::new_v4().to_string();
    let tx = ssh_client::open(
        app,
        state.db.clone(),
        session_id.clone(),
        params,
        cols.max(1),
        rows.max(1),
    )
    .await?;

    state.sessions.lock().await.insert(session_id.clone(), tx);

    {
        let conn = state.db.lock().await;
        let _ = host_repo::touch_last_used(&conn, &host_id);
    }

    Ok(session_id)
}

#[tauri::command]
pub async fn send_input(
    state: State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let tx = state.sessions.lock().await.get(&session_id).cloned();
    match tx {
        Some(tx) => tx
            .send(SessionRequest::Input(data))
            .await
            .map_err(|_| AppError::Ssh("session is closed".into())),
        None => Err(AppError::NotFound(format!("session {session_id}"))),
    }
}

#[tauri::command]
pub async fn resize_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let tx = state.sessions.lock().await.get(&session_id).cloned();
    if let Some(tx) = tx {
        let _ = tx
            .send(SessionRequest::Resize {
                cols: cols.max(1),
                rows: rows.max(1),
            })
            .await;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_session(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let tx = state.sessions.lock().await.remove(&session_id);
    if let Some(tx) = tx {
        let _ = tx.send(SessionRequest::Close).await;
    }
    Ok(())
}
