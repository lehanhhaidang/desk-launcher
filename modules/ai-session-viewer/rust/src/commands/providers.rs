//! Provider catalog.
//!
//! Providers are AI coding assistants that write session logs to a known
//! location on disk. The list is static for now; the frontend lets the user
//! pick one and override its base path before listing projects.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    /// Stable id, e.g. "claude-code".
    pub id: String,
    /// Human-facing name, e.g. "Claude Code".
    pub name: String,
    /// Default sessions root for this OS, if it can be resolved.
    pub default_base_path: Option<String>,
    /// Parser hint, e.g. "jsonl-claude". Reserved for format-specific parsing.
    pub session_format: String,
}

/// User home directory, cross-platform (`%USERPROFILE%` then `$HOME`).
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Join path segments onto the home directory, returned as a string.
fn under_home(segments: &[&str]) -> Option<String> {
    home_dir().map(|mut p| {
        for seg in segments {
            p.push(seg);
        }
        p.to_string_lossy().into_owned()
    })
}

#[tauri::command]
pub fn list_providers() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "claude-code".into(),
            name: "Claude Code".into(),
            // Windows: %USERPROFILE%\.claude\projects
            // macOS/Linux: ~/.claude/projects
            default_base_path: under_home(&[".claude", "projects"]),
            session_format: "jsonl-claude".into(),
        },
        ProviderInfo {
            id: "codex".into(),
            name: "Codex".into(),
            default_base_path: under_home(&[".codex", "sessions"]),
            session_format: "jsonl-codex".into(),
        },
    ]
}
