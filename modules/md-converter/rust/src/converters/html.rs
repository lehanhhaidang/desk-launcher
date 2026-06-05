//! HTML → Markdown via `htmd`.
//!
//! Bám sát Python markitdown `_html_converter.py` + `_CustomMarkdownify`:
//!
//!   - strip `<script>` và `<style>` (htmd builder `skip_tags`).
//!   - truncate `data:<mime>;base64,<long>` src/href thành `data:<mime>;base64,...`
//!     (như `_CustomMarkdownify.convert_img`).
//!   - chỉ giữ phần `<body>` nếu document có `<body>` tag (Python:
//!     `soup.find("body")`).
//!
//! Không port: title extraction (Python expose qua DocumentConverterResult.title;
//! ConvertResult upstream của ta lấy title từ filename stem), checkbox
//! `<input type=checkbox>` → `[x] / [ ]`, JS href filtering (htmd đã không
//! emit script tags nên href "javascript:" hiếm khi lọt qua).

use std::fs;
use std::path::Path;

use super::ConvertError;

pub fn convert_html_file(path: &Path) -> Result<String, ConvertError> {
    let html = fs::read_to_string(path)?;
    convert_html_str(&html)
}

pub fn convert_html_str(html: &str) -> Result<String, ConvertError> {
    let preprocessed = preprocess(html);

    let converter = htmd::HtmlToMarkdown::builder()
        .skip_tags(vec!["script", "style", "noscript", "head"])
        .build();

    converter
        .convert(&preprocessed)
        .map_err(|e| ConvertError::Parse(format!("html → md: {e}")))
}

fn preprocess(html: &str) -> String {
    // Cut down to <body>...</body> if present — mirrors Python's
    // soup.find("body") shortcut so head metadata doesn't leak through.
    let body = match (find_ci(html, "<body"), find_ci(html, "</body>")) {
        (Some(s), Some(e)) if e > s => {
            // Find the closing '>' of the opening <body ...>
            match html[s..].find('>') {
                Some(close) => &html[s + close + 1..e],
                None => html,
            }
        }
        _ => html,
    };

    truncate_data_uris(body)
}

fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    let lower = haystack.to_ascii_lowercase();
    lower.find(&needle.to_ascii_lowercase())
}

/// Replace long base64 data URIs with a truncated form. Mirrors Python's
/// `convert_img`: `src.split(",")[0] + "..."`.
fn truncate_data_uris(html: &str) -> String {
    // Cheap state machine, no regex dependency. We scan for `data:` and
    // when found, look for the next `,` (delimiter between metadata and
    // payload), then skip until the closing quote or whitespace and
    // replace the whole payload with `...`.
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 5 <= bytes.len() && &bytes[i..i + 5] == b"data:" {
            // Find the comma that ends the metadata portion.
            if let Some(comma_off) = bytes[i..].iter().position(|&c| c == b',') {
                // Find the end of the payload: next quote or whitespace.
                let payload_start = i + comma_off;
                let end_off = bytes[payload_start..]
                    .iter()
                    .position(|&c| matches!(c, b'"' | b'\'' | b' ' | b'\n' | b'\t' | b'>' | b')'))
                    .map(|n| payload_start + n)
                    .unwrap_or(bytes.len());
                let payload_len = end_off - payload_start;
                // Only truncate if payload is "long" — Python truncates
                // anything but we follow suit; keeps tiny SVG markers
                // intact too because they tend to be reasonable.
                if payload_len > 64 {
                    out.push_str(&html[i..payload_start]);
                    out.push_str("...");
                    i = end_off;
                    continue;
                }
            }
        }
        out.push(html[i..].chars().next().unwrap());
        i += html[i..].chars().next().unwrap().len_utf8();
    }
    out
}
