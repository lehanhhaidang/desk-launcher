use crate::error::AppResult;
use crate::models::workspace::{CreateWorkspaceInput, UpdateWorkspaceInput, Workspace};
use crate::services::workspace_service;
use crate::state::AppState;

#[tauri::command]
pub async fn workspace_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<Workspace>> {
    let db = state.db.lock().await;
    workspace_service::list_all(&db)
}

#[tauri::command]
pub async fn workspace_create(
    state: tauri::State<'_, AppState>,
    input: CreateWorkspaceInput,
) -> AppResult<Workspace> {
    let db = state.db.lock().await;
    workspace_service::create(&db, input)
}

#[tauri::command]
pub async fn workspace_update(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateWorkspaceInput,
) -> AppResult<Workspace> {
    let db = state.db.lock().await;
    workspace_service::update(&db, &id, input)
}

#[tauri::command]
pub async fn workspace_delete(state: tauri::State<'_, AppState>, id: String) -> AppResult<()> {
    let db = state.db.lock().await;
    workspace_service::delete(&db, &id)
}
