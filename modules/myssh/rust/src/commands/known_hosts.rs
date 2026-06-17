use crate::db::known_hosts_repo;
use crate::error::AppResult;
use crate::models::known_host::KnownHost;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_known_hosts(state: State<'_, AppState>) -> AppResult<Vec<KnownHost>> {
    let conn = state.db.lock().await;
    known_hosts_repo::list(&conn)
}

#[tauri::command]
pub async fn remove_known_host(
    state: State<'_, AppState>,
    host: String,
    port: u16,
) -> AppResult<()> {
    let conn = state.db.lock().await;
    known_hosts_repo::remove(&conn, &host, port)
}

/// Fulfil an interactive host-key prompt: `accept = true` trusts the key.
#[tauri::command]
pub async fn respond_host_key(
    state: State<'_, AppState>,
    request_id: String,
    accept: bool,
) -> AppResult<()> {
    if let Some(tx) = state.host_key_prompts.lock().await.remove(&request_id) {
        let _ = tx.send(accept);
    }
    Ok(())
}
