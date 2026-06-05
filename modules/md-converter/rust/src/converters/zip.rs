//! ZIP archives → Markdown.
//!
//! Walks the archive and, for each entry whose extension we recognise,
//! converts the contents to Markdown and prefixes a `### <path>` header.
//! Office formats (DOCX/XLSX/PPTX) and other nested archives are skipped
//! to avoid recursive temp-file extraction — we'd need to write each
//! entry to a temp file first, and the marginal value is low.

use std::io::Read;
use std::path::Path;

use super::tabular::convert_csv_str;
use super::ConvertError;

pub fn convert_zip(path: &Path) -> Result<String, ConvertError> {
    let file = std::fs::File::open(path)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| ConvertError::Parse(format!("open zip: {e}")))?;

    let mut out = String::new();
    out.push_str(&format!(
        "# Archive: {}\n\n",
        path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "<unnamed>".to_string())
    ));

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let ext = Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();

        out.push_str(&format!("### {name}\n\n"));

        let block = match ext.as_str() {
            "txt" | "md" | "markdown" => {
                let mut s = String::new();
                let _ = entry.read_to_string(&mut s);
                s
            }
            "csv" => {
                let mut s = String::new();
                let _ = entry.read_to_string(&mut s);
                convert_csv_str(&s).unwrap_or_else(|_| s)
            }
            "json" => {
                let mut s = String::new();
                let _ = entry.read_to_string(&mut s);
                match super::json::convert_json_str(&s) {
                    Ok(md) => md,
                    Err(_) => format!("```json\n{s}\n```\n"),
                }
            }
            "html" | "htm" => {
                let mut s = String::new();
                let _ = entry.read_to_string(&mut s);
                super::html::convert_html_str(&s).unwrap_or(s)
            }
            "xml" => {
                let mut s = String::new();
                let _ = entry.read_to_string(&mut s);
                format!("```xml\n{}\n```\n", s.trim_end())
            }
            other => format!("_skipped: .{other} entry_\n"),
        };

        out.push_str(&block);
        if !out.ends_with("\n\n") {
            out.push_str("\n\n");
        }
    }

    Ok(out)
}
