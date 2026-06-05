//! XLSX/XLS → Markdown via `calamine`. Each sheet becomes a `## <name>`
//! section followed by a Markdown table.

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};

use super::tabular::rows_to_markdown;
use super::ConvertError;

pub fn convert_xlsx(path: &Path) -> Result<String, ConvertError> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| ConvertError::Parse(format!("open xlsx: {e}")))?;

    let mut out = String::new();
    let sheet_names: Vec<String> = workbook.sheet_names().to_owned();

    for name in sheet_names {
        let range = match workbook.worksheet_range(&name) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if range.is_empty() {
            continue;
        }

        out.push_str("## ");
        out.push_str(&name);
        out.push_str("\n\n");

        let rows: Vec<Vec<String>> = range
            .rows()
            .map(|row| row.iter().map(cell_to_string).collect())
            .collect();

        out.push_str(&rows_to_markdown(&rows));
        out.push('\n');
    }

    Ok(out)
}

fn cell_to_string(c: &Data) -> String {
    match c {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => format!("{}", dt.as_f64()),
        Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("#ERR:{e:?}"),
    }
}
