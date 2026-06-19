use crate::db::snippet_repo;
use crate::error::AppResult;
use crate::models::snippet::{Snippet, SnippetInput};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_snippets(state: State<'_, AppState>) -> AppResult<Vec<Snippet>> {
    let conn = state.db.lock().await;
    snippet_repo::list(&conn)
}

#[tauri::command]
pub async fn create_snippet(state: State<'_, AppState>, input: SnippetInput) -> AppResult<Snippet> {
    let conn = state.db.lock().await;
    snippet_repo::create(&conn, input)
}

#[tauri::command]
pub async fn update_snippet(
    state: State<'_, AppState>,
    id: String,
    input: SnippetInput,
) -> AppResult<Snippet> {
    let conn = state.db.lock().await;
    snippet_repo::update(&conn, &id, input)
}

#[tauri::command]
pub async fn delete_snippet(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().await;
    snippet_repo::delete(&conn, &id)
}
