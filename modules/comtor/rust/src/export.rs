use crate::error::AppResult;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_xlsx(
    app: AppHandle,
    bytes: Vec<u8>,
    suggested_name: String,
) -> AppResult<Option<String>> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Excel", &["xlsx"])
        .set_file_name(&suggested_name)
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let chosen = rx.recv().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let path_str = file_path.to_string();
    if let Some(p) = file_path.as_path() {
        std::fs::write(p, &bytes)?;
    } else {
        return Err(crate::error::AppError::Internal(
            "save dialog returned non-path target".into(),
        ));
    }
    Ok(Some(path_str))
}
