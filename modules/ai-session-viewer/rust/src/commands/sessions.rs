//! Project / session listing and session parsing.
//!
//! A "project" is a folder inside a provider's sessions root; a "session" is a
//! single `.jsonl` file inside it. `read_session` strips the log down to the
//! human-readable conversation (user + assistant text), dropping tool calls,
//! tool results, thinking blocks and bookkeeping entries.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::Value;

use crate::error::{Result, ViewerError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub path: String,
    pub session_count: usize,
    pub last_modified: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub id: String,
    pub path: String,
    pub size_bytes: u64,
    pub last_modified: u64,
    /// Best-effort human title (summary entry or first user line).
    pub title: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
}

/// Unix-seconds mtime of a path, 0 if unavailable.
fn mtime_secs(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn is_jsonl(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("jsonl"))
        .unwrap_or(false)
}

fn ensure_dir(path: &str) -> Result<PathBuf> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(ViewerError::NotFound(path.to_string()));
    }
    if !p.is_dir() {
        return Err(ViewerError::NotDir(path.to_string()));
    }
    Ok(p)
}

/// Count `.jsonl` files in a directory and report the newest mtime among them.
fn scan_project_dir(dir: &Path) -> (usize, u64) {
    let mut count = 0usize;
    let mut newest = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_jsonl(&path) {
                count += 1;
                if let Ok(meta) = entry.metadata() {
                    newest = newest.max(mtime_secs(&meta));
                }
            }
        }
    }
    (count, newest)
}

#[tauri::command]
pub fn list_projects(base_path: String) -> std::result::Result<Vec<ProjectEntry>, String> {
    list_projects_inner(&base_path).map_err(|e| e.to_string())
}

fn list_projects_inner(base_path: &str) -> Result<Vec<ProjectEntry>> {
    let base = ensure_dir(base_path)?;
    let mut projects = Vec::new();

    for entry in fs::read_dir(&base)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let (session_count, last_modified) = scan_project_dir(&path);
        if session_count == 0 {
            continue; // skip folders with no sessions
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        projects.push(ProjectEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            session_count,
            last_modified,
        });
    }

    // Most recently active projects first.
    projects.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(projects)
}

#[tauri::command]
pub fn list_sessions(project_path: String) -> std::result::Result<Vec<SessionEntry>, String> {
    list_sessions_inner(&project_path).map_err(|e| e.to_string())
}

fn list_sessions_inner(project_path: &str) -> Result<Vec<SessionEntry>> {
    let dir = ensure_dir(project_path)?;
    let mut sessions = Vec::new();

    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || !is_jsonl(&path) {
            continue;
        }
        let meta = entry.metadata()?;
        let id = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        sessions.push(SessionEntry {
            id,
            title: read_session_title(&path),
            path: path.to_string_lossy().into_owned(),
            size_bytes: meta.len(),
            last_modified: mtime_secs(&meta),
        });
    }

    sessions.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(sessions)
}

/// Cheap title probe. Claude Code records a generated title in `ai-title`
/// entries (key `aiTitle`) that refine as the chat grows, and an optional
/// user-set `custom-title`. We prefer those, then a `summary` entry, then the
/// first user line. Bounded so listing a large project stays fast.
fn read_session_title(path: &Path) -> Option<String> {
    const MAX_LINES: usize = 120;
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut custom_title: Option<String> = None; // last seen wins
    let mut ai_title: Option<String> = None; // last seen wins (title refines)
    let mut summary: Option<String> = None; // first seen
    let mut first_user: Option<String> = None; // first seen

    let pick = |v: &Value, keys: &[&str]| -> Option<String> {
        for k in keys {
            if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
                let s = s.trim();
                if !s.is_empty() {
                    return Some(truncate(s, 100));
                }
            }
        }
        None
    };

    for (i, line) in reader.lines().enumerate() {
        if i >= MAX_LINES {
            break;
        }
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };
        let v: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("custom-title") => {
                if let Some(t) = pick(&v, &["customTitle", "title"]) {
                    custom_title = Some(t);
                }
            }
            Some("ai-title") => {
                if let Some(t) = pick(&v, &["aiTitle", "title"]) {
                    ai_title = Some(t);
                }
            }
            Some("summary") => {
                if summary.is_none() {
                    summary = pick(&v, &["summary"]);
                }
            }
            Some("user") => {
                if first_user.is_none() {
                    let text = v
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .map(extract_text)
                        .unwrap_or_default();
                    let text = text.trim();
                    if !text.is_empty() {
                        first_user = Some(truncate(text, 100));
                    }
                }
            }
            _ => {}
        }
    }

    custom_title.or(ai_title).or(summary).or(first_user)
}

fn truncate(s: &str, max: usize) -> String {
    let cleaned = s.replace(['\n', '\r'], " ");
    if cleaned.chars().count() <= max {
        return cleaned;
    }
    let mut out: String = cleaned.chars().take(max).collect();
    out.push('…');
    out
}

#[tauri::command]
pub fn read_session(session_path: String) -> std::result::Result<Vec<ChatMessage>, String> {
    read_session_inner(&session_path).map_err(|e| e.to_string())
}

fn read_session_inner(session_path: &str) -> Result<Vec<ChatMessage>> {
    let path = PathBuf::from(session_path);
    if !path.exists() {
        return Err(ViewerError::NotFound(session_path.to_string()));
    }
    let content = fs::read_to_string(&path)?;
    let mut messages = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue, // skip malformed lines, don't fail the whole read
        };

        let entry_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if entry_type != "user" && entry_type != "assistant" {
            continue; // drop summary / system / file-history-snapshot / etc.
        }
        // Skip launcher-injected / meta turns (command echoes, hook output).
        if v.get("isMeta").and_then(|m| m.as_bool()).unwrap_or(false) {
            continue;
        }

        let message = match v.get("message") {
            Some(m) => m,
            None => continue,
        };
        let role = message
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or(entry_type)
            .to_string();
        let text = message.get("content").map(extract_text).unwrap_or_default();
        if text.trim().is_empty() {
            continue; // tool-result-only / image-only turns collapse to nothing
        }
        let timestamp = v
            .get("timestamp")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        messages.push(ChatMessage {
            role,
            content: text,
            timestamp,
        });
    }

    Ok(messages)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_text_handles_string() {
        assert_eq!(extract_text(&json!("hello")), "hello");
    }

    #[test]
    fn extract_text_keeps_text_blocks_drops_tools() {
        let content = json!([
            { "type": "text", "text": "first" },
            { "type": "tool_use", "name": "Read", "input": {} },
            { "type": "thinking", "thinking": "secret" },
            { "type": "text", "text": "second" },
        ]);
        assert_eq!(extract_text(&content), "first\nsecond");
    }

    #[test]
    fn extract_text_empty_for_tool_result_only() {
        let content = json!([{ "type": "tool_result", "content": "output" }]);
        assert_eq!(extract_text(&content), "");
    }

    #[test]
    fn read_session_filters_to_conversation() {
        let dir = std::env::temp_dir();
        let path = dir.join("aisv_test_session.jsonl");
        let lines = [
            json!({ "type": "queue-operation", "operation": "x" }),
            json!({ "type": "user", "timestamp": "2026-06-23T01:00:00Z",
                    "message": { "role": "user", "content": "hi there" } }),
            json!({ "type": "assistant",
                    "message": { "role": "assistant", "content": [
                        { "type": "thinking", "thinking": "..." },
                        { "type": "text", "text": "hello back" },
                        { "type": "tool_use", "name": "Read", "input": {} },
                    ] } }),
            // tool-result-only user turn → should be dropped (empty text)
            json!({ "type": "user",
                    "message": { "role": "user", "content": [
                        { "type": "tool_result", "content": "file bytes" },
                    ] } }),
            // meta turn → dropped
            json!({ "type": "user", "isMeta": true,
                    "message": { "role": "user", "content": "command output" } }),
            json!({ "type": "ai-title", "aiTitle": "Test session" }),
        ];
        let body = lines
            .iter()
            .map(|l| l.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&path, body).unwrap();

        let msgs = read_session_inner(path.to_str().unwrap()).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].content, "hi there");
        assert_eq!(msgs[0].timestamp.as_deref(), Some("2026-06-23T01:00:00Z"));
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].content, "hello back");
    }
}

/// Pull human-readable text out of a `message.content` value.
///
/// - string  → used as-is (user messages can be a bare string)
/// - array   → concatenate `type == "text"` blocks; drop `tool_use`,
///             `tool_result`, `thinking`, images, etc.
fn extract_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    block.get("text").and_then(|t| t.as_str()).map(str::to_string)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
