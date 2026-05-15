//! Markdown Converter Tauri plugin — pure Rust.
//!
//! Port of Microsoft's MarkItDown core (Python) — supports the practical
//! file formats with mature Rust crates:
//!
//!   DOCX, XLSX, PPTX, PDF, HTML, MD, TXT, CSV, JSON, XML, EPUB, IPYNB, ZIP
//!
//! Image OCR and audio transcription are NOT included (would need an LLM
//! API key — kept for a future iteration).

mod converters;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Wry;

use converters::ConvertError;

#[derive(Debug, Serialize)]
pub struct ConvertResult {
    pub markdown: String,
    pub title: Option<String>,
    pub source_path: Option<String>,
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct BatchEntry {
    pub source_path: String,
    pub output_path: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchRequest {
    pub paths: Vec<String>,
    pub output_dir: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Deserialize)]
pub struct TextConvertRequest {
    pub content: String,
    pub format: String,
    #[serde(default)]
    pub filename: Option<String>,
}

#[tauri::command]
fn convert_file(path: String) -> Result<ConvertResult, String> {
    let p = Path::new(&path);
    let format = detect_format(p).ok_or_else(|| {
        format!(
            "Unsupported file: {}",
            p.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone()),
        )
    })?;

    let markdown = converters::convert_path(p, &format).map_err(|e| e.to_string())?;
    let title = p
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned());

    Ok(ConvertResult {
        markdown,
        title,
        source_path: Some(p.to_string_lossy().into_owned()),
        format,
    })
}

#[tauri::command]
fn convert_text(request: TextConvertRequest) -> Result<ConvertResult, String> {
    let markdown =
        converters::convert_text(&request.content, &request.format).map_err(|e| e.to_string())?;
    Ok(ConvertResult {
        markdown,
        title: request.filename,
        source_path: None,
        format: request.format,
    })
}

#[tauri::command]
fn convert_batch(request: BatchRequest) -> Vec<BatchEntry> {
    let output_dir = PathBuf::from(&request.output_dir);
    if !output_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&output_dir) {
            return request
                .paths
                .into_iter()
                .map(|p| BatchEntry {
                    source_path: p,
                    output_path: None,
                    success: false,
                    error: Some(format!("create output dir: {e}")),
                    format: None,
                })
                .collect();
        }
    }

    request
        .paths
        .into_iter()
        .map(|src| convert_one_to_disk(&src, &output_dir, request.overwrite))
        .collect()
}

fn convert_one_to_disk(src: &str, output_dir: &Path, overwrite: bool) -> BatchEntry {
    let path = Path::new(src);
    let format = match detect_format(path) {
        Some(f) => f,
        None => {
            return BatchEntry {
                source_path: src.to_string(),
                output_path: None,
                success: false,
                error: Some("unsupported extension".into()),
                format: None,
            }
        }
    };

    let stem = match path.file_stem() {
        Some(s) => s.to_string_lossy().into_owned(),
        None => {
            return BatchEntry {
                source_path: src.to_string(),
                output_path: None,
                success: false,
                error: Some("invalid filename".into()),
                format: Some(format),
            }
        }
    };

    let mut out_path = output_dir.join(format!("{stem}.md"));
    if !overwrite && out_path.exists() {
        let mut idx = 1;
        loop {
            let candidate = output_dir.join(format!("{stem}-{idx}.md"));
            if !candidate.exists() {
                out_path = candidate;
                break;
            }
            idx += 1;
            if idx > 999 {
                break;
            }
        }
    }

    match converters::convert_path(path, &format) {
        Ok(markdown) => match std::fs::write(&out_path, markdown) {
            Ok(()) => BatchEntry {
                source_path: src.to_string(),
                output_path: Some(out_path.to_string_lossy().into_owned()),
                success: true,
                error: None,
                format: Some(format),
            },
            Err(e) => BatchEntry {
                source_path: src.to_string(),
                output_path: None,
                success: false,
                error: Some(format!("write: {e}")),
                format: Some(format),
            },
        },
        Err(e) => BatchEntry {
            source_path: src.to_string(),
            output_path: None,
            success: false,
            error: Some(e.to_string()),
            format: Some(format),
        },
    }
}

#[tauri::command]
fn supported_extensions() -> Vec<String> {
    SUPPORTED_EXTS.iter().map(|s| s.to_string()).collect()
}

const SUPPORTED_EXTS: &[&str] = &[
    "docx", "xlsx", "xls", "pptx", "pdf", "html", "htm", "md", "markdown", "txt", "csv", "json",
    "xml", "epub", "ipynb", "zip",
];

fn detect_format(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if SUPPORTED_EXTS.contains(&ext.as_str()) {
        // Normalize a few aliases.
        let canon = match ext.as_str() {
            "htm" => "html",
            "markdown" => "md",
            "xls" => "xls",
            other => other,
        };
        Some(canon.to_string())
    } else {
        None
    }
}

// Surface our error type as Display for the frontend.
impl std::fmt::Display for ConvertError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConvertError::Io(e) => write!(f, "io: {e}"),
            ConvertError::Parse(msg) => write!(f, "parse: {msg}"),
            ConvertError::Unsupported(ext) => write!(f, "unsupported format: {ext}"),
        }
    }
}

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("md-converter")
        .invoke_handler(tauri::generate_handler![
            convert_file,
            convert_text,
            convert_batch,
            supported_extensions,
        ])
        .setup(|_app, _api| {
            log::info!("md-converter plugin initialized (Rust)");
            Ok(())
        })
        .build()
}
