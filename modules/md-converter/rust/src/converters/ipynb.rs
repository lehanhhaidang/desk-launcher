//! Jupyter notebook (.ipynb) → Markdown.
//!
//! 1:1 port của Python markitdown `_ipynb_converter.py`:
//!
//!   - markdown cells: source verbatim
//!   - code cells: `` ```python\n<source>\n``` `` (hardcoded `python`,
//!     không dùng `metadata.language_info.name`).
//!   - raw cells: `` ```\n<source>\n``` ``
//!   - cell outputs: **bỏ** (Python không render outputs).
//!   - title: extract từ first `# ` heading trong markdown cells; nếu
//!     `metadata.title` tồn tại thì override.

use std::fs;
use std::path::Path;

use serde_json::Value;

use super::ConvertError;

pub fn convert_ipynb(path: &Path) -> Result<String, ConvertError> {
    let content = fs::read_to_string(path)?;
    let nb: Value = serde_json::from_str(&content)
        .map_err(|e| ConvertError::Parse(format!("ipynb json: {e}")))?;

    let mut chunks: Vec<String> = Vec::new();
    let mut title: Option<String> = None;

    let empty: Vec<Value> = Vec::new();
    let cells = nb
        .get("cells")
        .and_then(Value::as_array)
        .unwrap_or(&empty);

    for cell in cells {
        let cell_type = cell.get("cell_type").and_then(Value::as_str).unwrap_or("");
        let source = join_strings(cell.get("source"));

        match cell_type {
            "markdown" => {
                if title.is_none() {
                    for line in source.lines() {
                        if let Some(rest) = line.strip_prefix("# ") {
                            title = Some(rest.trim_start_matches('#').trim().to_string());
                            break;
                        }
                    }
                }
                chunks.push(source);
            }
            "code" => {
                chunks.push(format!("```python\n{}\n```", source));
            }
            "raw" => {
                chunks.push(format!("```\n{}\n```", source));
            }
            _ => {}
        }
    }

    // Python markitdown also honors metadata.title if present.
    if let Some(meta_title) = nb
        .get("metadata")
        .and_then(|m| m.get("title"))
        .and_then(Value::as_str)
    {
        title = Some(meta_title.to_string());
    }

    let mut md = chunks.join("\n\n");
    // If title was extracted but the first cell didn't already contain
    // that heading at the very top, leave the document as-is — the title
    // is exposed through the `title` field of ConvertResult upstream.
    // Trim trailing whitespace for parity with Python output.
    md = md.trim().to_string();

    // Note: the title is currently not threaded out to ConvertResult from
    // the per-format converters; lib.rs derives `title` from the filename
    // stem. We keep the extraction logic so we can wire it through later.
    let _ = title;

    Ok(md)
}

fn join_strings(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}
