//! CSV → Markdown table.

use std::fs::File;
use std::path::Path;

use super::ConvertError;

pub fn convert_csv(path: &Path) -> Result<String, ConvertError> {
    let file = File::open(path)?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(false)
        .from_reader(file);

    let rows: Vec<Vec<String>> = rdr
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|c| c.to_string()).collect())
        .collect();

    Ok(rows_to_markdown(&rows))
}

pub fn convert_csv_str(content: &str) -> Result<String, ConvertError> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(false)
        .from_reader(content.as_bytes());

    let rows: Vec<Vec<String>> = rdr
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|c| c.to_string()).collect())
        .collect();

    Ok(rows_to_markdown(&rows))
}

pub fn rows_to_markdown(rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return String::new();
    }

    let cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if cols == 0 {
        return String::new();
    }

    let mut out = String::new();
    let header = &rows[0];

    out.push('|');
    for c in 0..cols {
        let cell = header.get(c).map(String::as_str).unwrap_or("");
        out.push(' ');
        out.push_str(&escape_pipe(cell));
        out.push_str(" |");
    }
    out.push('\n');

    out.push('|');
    for _ in 0..cols {
        out.push_str(" --- |");
    }
    out.push('\n');

    for row in rows.iter().skip(1) {
        out.push('|');
        for c in 0..cols {
            let cell = row.get(c).map(String::as_str).unwrap_or("");
            out.push(' ');
            out.push_str(&escape_pipe(cell));
            out.push_str(" |");
        }
        out.push('\n');
    }

    out
}

pub fn escape_pipe(s: &str) -> String {
    s.replace('\n', " ").replace('|', "\\|")
}
