//! Manages module windows: spawn, focus-existing, close.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::module_registry;

#[derive(Debug, thiserror::Error)]
pub enum WindowError {
    #[error("unknown module id: {0}")]
    UnknownModule(String),
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

impl serde::Serialize for WindowError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn open_module(app: AppHandle, id: String) -> Result<(), WindowError> {
    log::info!("open_module: {}", id);

    // If already open, just focus it.
    if let Some(existing) = app.get_webview_window(&id) {
        existing.set_focus()?;
        existing.unminimize().ok();
        return Ok(());
    }

    let spec = module_registry::find(&id).ok_or_else(|| WindowError::UnknownModule(id.clone()))?;

    let mut builder = WebviewWindowBuilder::new(
        &app,
        spec.id,
        WebviewUrl::App(spec.initial_url.into()),
    )
    .title(spec.title)
    .inner_size(spec.width, spec.height)
    .resizable(true)
    .center();

    if let (Some(min_w), Some(min_h)) = (spec.min_width, spec.min_height) {
        builder = builder.min_inner_size(min_w, min_h);
    }

    builder.build()?;
    Ok(())
}

#[tauri::command]
pub async fn close_module(app: AppHandle, id: String) -> Result<(), WindowError> {
    if let Some(window) = app.get_webview_window(&id) {
        window.close()?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_open_modules(app: AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| label.as_str() != "launcher")
        .cloned()
        .collect()
}
