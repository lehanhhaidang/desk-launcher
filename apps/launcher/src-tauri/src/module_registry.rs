//! Rust-side mirror of the TypeScript module registry.
//!
//! The TS side (`apps/launcher/src/modules/registry.ts`) is what the
//! dashboard renders. This file mirrors the *window configuration* needed
//! to spawn each module's `WebviewWindow`.
//!
//! When adding a new module, edit both files. Keeping them in sync is part
//! of the "add a module" checklist (also: wire its Rust plugin in lib.rs,
//! add its Vite entry in vite.config.ts, add a per-window capability file).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleWindowSpec {
    pub id: &'static str,
    pub title: &'static str,
    pub initial_url: &'static str,
    pub width: f64,
    pub height: f64,
    pub min_width: Option<f64>,
    pub min_height: Option<f64>,
}

pub const MODULES: &[ModuleWindowSpec] = &[
    ModuleWindowSpec {
        id: "myssh",
        title: "🖥️ MySSH",
        initial_url: "modules-pages/myssh/index.html",
        width: 1280.0,
        height: 820.0,
        min_width: Some(1000.0),
        min_height: Some(640.0),
    },
    ModuleWindowSpec {
        id: "open-sesame",
        title: "📚 Open Sesame",
        initial_url: "modules-pages/open-sesame/index.html",
        width: 1280.0,
        height: 800.0,
        min_width: Some(960.0),
        min_height: Some(600.0),
    },
    ModuleWindowSpec {
        id: "comtor",
        title: "Virtual Comtor",
        initial_url: "modules-pages/comtor/index.html",
        width: 1280.0,
        height: 800.0,
        min_width: Some(960.0),
        min_height: Some(600.0),
    },
    ModuleWindowSpec {
        id: "video-downloader",
        title: "Media Toolbox",
        initial_url: "modules-pages/video-downloader/index.html",
        width: 1100.0,
        height: 760.0,
        min_width: Some(800.0),
        min_height: Some(500.0),
    },
    ModuleWindowSpec {
        id: "md-converter",
        title: "📝 Markdown Converter",
        initial_url: "modules-pages/md-converter/index.html",
        width: 1200.0,
        height: 800.0,
        min_width: Some(900.0),
        min_height: Some(600.0),
    },
    ModuleWindowSpec {
        id: "ai-session-viewer",
        title: "🧠 AI Session Viewer",
        initial_url: "modules-pages/ai-session-viewer/index.html",
        width: 1300.0,
        height: 860.0,
        min_width: Some(1000.0),
        min_height: Some(640.0),
    },
];

pub fn find(id: &str) -> Option<&'static ModuleWindowSpec> {
    MODULES.iter().find(|m| m.id == id)
}

#[tauri::command]
pub fn list_modules() -> Vec<String> {
    MODULES.iter().map(|m| m.id.to_string()).collect()
}
