use crate::db::host_repo;
use crate::error::AppResult;
use crate::models::host::{Host, HostInput};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_hosts(state: State<'_, AppState>) -> AppResult<Vec<Host>> {
    let conn = state.db.lock().await;
    host_repo::list(&conn)
}

#[tauri::command]
pub async fn create_host(state: State<'_, AppState>, input: HostInput) -> AppResult<Host> {
    let conn = state.db.lock().await;
    host_repo::create(&conn, input)
}

#[tauri::command]
pub async fn update_host(
    state: State<'_, AppState>,
    id: String,
    input: HostInput,
) -> AppResult<Host> {
    let conn = state.db.lock().await;
    host_repo::update(&conn, &id, input)
}

#[tauri::command]
pub async fn delete_host(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().await;
    host_repo::delete(&conn, &id)
}
