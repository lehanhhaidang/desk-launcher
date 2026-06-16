use crate::db::group_repo;
use crate::error::AppResult;
use crate::models::group::{Group, GroupInput};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> AppResult<Vec<Group>> {
    let conn = state.db.lock().await;
    group_repo::list(&conn)
}

#[tauri::command]
pub async fn create_group(state: State<'_, AppState>, input: GroupInput) -> AppResult<Group> {
    let conn = state.db.lock().await;
    group_repo::create(&conn, input)
}

#[tauri::command]
pub async fn delete_group(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().await;
    group_repo::delete(&conn, &id)
}
