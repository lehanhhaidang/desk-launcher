use crate::error::AppResult;
use crate::services::{file_meta_service, file_tree_service, search_service};
use crate::state::AppState;

#[tauri::command]
pub async fn file_tree(
    source_path: String,
    max_depth: Option<u32>,
    include_git_status: Option<bool>,
) -> AppResult<file_tree_service::FileNode> {
    let path = std::path::Path::new(&source_path);
    file_tree_service::read_tree_with_options(
        path,
        max_depth.unwrap_or(5),
        include_git_status.unwrap_or(true),
    )
}

#[tauri::command]
pub async fn file_content(
    file_path: String,
    max_bytes: Option<usize>,
) -> AppResult<file_tree_service::FileContent> {
    let path = std::path::Path::new(&file_path);
    file_tree_service::read_file_content(path, max_bytes.unwrap_or(1_000_000))
}

#[tauri::command]
pub async fn file_search(
    source_path: String,
    query: String,
    search_type: Option<String>,
    max_results: Option<usize>,
) -> AppResult<serde_json::Value> {
    let path = std::path::Path::new(&source_path);
    let max = max_results.unwrap_or(50);

    match search_type.as_deref().unwrap_or("content") {
        "filename" => {
            let results = search_service::search_filenames(path, &query, max)?;
            Ok(serde_json::to_value(results).unwrap())
        }
        _ => {
            let results = search_service::search_content(path, &query, max)?;
            Ok(serde_json::to_value(results).unwrap())
        }
    }
}

#[tauri::command]
pub async fn file_toggle_bookmark(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
    file_path: String,
) -> AppResult<bool> {
    let db = state.db.lock().await;
    file_meta_service::toggle_bookmark(&db, &doc_set_id, &file_path)
}

#[tauri::command]
pub async fn file_list_bookmarks(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<Vec<crate::db::file_meta_repo::FileMeta>> {
    let db = state.db.lock().await;
    file_meta_service::list_bookmarks(&db, &doc_set_id)
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> AppResult<()> {
    std::fs::write(&path, &content)?;
    Ok(())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> AppResult<String> {
    let content = std::fs::read_to_string(&path)?;
    Ok(content)
}
