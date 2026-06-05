//! PDF → Markdown via `pdf-extract`.
//!
//! Text-only extraction. Output is plain text wrapped as paragraphs
//! (consecutive blank lines collapsed). No layout reconstruction —
//! the same caveat as the Python `markitdown` PDF converter.

use std::path::Path;

use super::ConvertError;

pub fn convert_pdf(path: &Path) -> Result<String, ConvertError> {
    let text = pdf_extract::extract_text(path)
        .map_err(|e| ConvertError::Parse(format!("pdf extract: {e}")))?;

    // Collapse 3+ newlines down to 2, normalize Windows line endings.
    let normalized = text.replace("\r\n", "\n");
    let mut out = String::with_capacity(normalized.len());
    let mut newlines = 0;
    for ch in normalized.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines <= 2 {
                out.push('\n');
            }
        } else {
            newlines = 0;
            out.push(ch);
        }
    }
    Ok(out.trim().to_string() + "\n")
}
