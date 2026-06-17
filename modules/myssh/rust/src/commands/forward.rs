use crate::db::forward_repo;
use crate::error::AppResult;
use crate::models::forward::{Forward, ForwardInput, ForwardStatus};
use crate::services::forward;
use crate::services::ssh_client;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_forwards(state: State<'_, AppState>) -> AppResult<Vec<ForwardStatus>> {
    let defs = {
        let conn = state.db.lock().await;
        forward_repo::list(&conn)?
    };
    let running = state.forwards.lock().await;
    Ok(defs
        .into_iter()
        .map(|f| {
            let is_running = running.contains_key(&f.id);
            ForwardStatus {
                forward: f,
                running: is_running,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn create_forward(state: State<'_, AppState>, input: ForwardInput) -> AppResult<Forward> {
    let conn = state.db.lock().await;
    forward_repo::create(&conn, input)
}

#[tauri::command]
pub async fn delete_forward(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(handle) = state.forwards.lock().await.remove(&id) {
        handle.stop();
    }
    let conn = state.db.lock().await;
    forward_repo::delete(&conn, &id)
}

#[tauri::command]
pub async fn start_forward(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if state.forwards.lock().await.contains_key(&id) {
        return Ok(());
    }

    let def = {
        let conn = state.db.lock().await;
        forward_repo::get(&conn, &id)?
    };
    let params = ssh_client::resolve_params(state.db.clone(), &def.host_id).await?;

    let kind = def.kind.clone();
    let handle = match kind.as_str() {
        "remote" => forward::start_remote(state.db.clone(), params, def).await?,
        "dynamic" => forward::start_dynamic(state.db.clone(), params, def).await?,
        _ => forward::start_local(state.db.clone(), params, def).await?,
    };
    state.forwards.lock().await.insert(id, handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_forward(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(handle) = state.forwards.lock().await.remove(&id) {
        handle.stop();
    }
    Ok(())
}
