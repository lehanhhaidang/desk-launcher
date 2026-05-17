//! Per-feature subdirectories under the module's data directory.
//!
//! All paths live below `<launcher_data>/modules/video-downloader/`:
//!
//! ```text
//! downloads/                — yt-dlp output for the Capture workflow
//! images/<task_id>/         — image batch outputs
//! videos/<task_id>/         — video processing outputs
//! ```

use std::path::PathBuf;

const MODULE_ID: &str = "video-downloader";

fn root() -> Result<PathBuf, String> {
    launcher_paths::module_data_dir(MODULE_ID).map_err(|e| format!("module dir: {e}"))
}

pub fn downloads_dir() -> Result<PathBuf, String> {
    let path = root()?.join("downloads");
    std::fs::create_dir_all(&path).map_err(|e| format!("mkdir downloads: {e}"))?;
    Ok(path)
}

pub fn image_task_dir(task_id: &str) -> Result<PathBuf, String> {
    let path = root()?.join("images").join(task_id);
    std::fs::create_dir_all(&path).map_err(|e| format!("mkdir image task: {e}"))?;
    Ok(path)
}

pub fn video_task_dir(task_id: &str) -> Result<PathBuf, String> {
    let path = root()?.join("videos").join(task_id);
    std::fs::create_dir_all(&path).map_err(|e| format!("mkdir video task: {e}"))?;
    Ok(path)
}
