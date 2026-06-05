use crate::error::{AppError, AppResult};
use std::path::PathBuf;

fn audio_dir() -> AppResult<PathBuf> {
    let dir = launcher_paths::module_data_dir("comtor")
        .map_err(|e| AppError::Internal(format!("module data dir: {e}")))?
        .join("audio");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub fn save_audio(meeting_id: String, bytes: Vec<u8>) -> AppResult<String> {
    let dir = audio_dir()?;
    let filename = format!("{meeting_id}.webm");
    let path = dir.join(&filename);
    std::fs::write(&path, &bytes)?;
    Ok(filename)
}

#[tauri::command]
pub fn get_audio(meeting_id: String) -> AppResult<Vec<u8>> {
    let dir = audio_dir()?;
    let path = dir.join(format!("{meeting_id}.webm"));
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "audio for meeting {meeting_id}"
        )));
    }
    Ok(std::fs::read(&path)?)
}

#[tauri::command]
pub fn delete_audio(meeting_id: String) -> AppResult<()> {
    let dir = audio_dir()?;
    let path = dir.join(format!("{meeting_id}.webm"));
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn audio_exists(meeting_id: String) -> AppResult<bool> {
    let dir = audio_dir()?;
    Ok(dir.join(format!("{meeting_id}.webm")).exists())
}
