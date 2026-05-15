//! JSON → Markdown.
//!
//! Strategy:
//!   - If top level is an array of flat objects, emit a table.
//!   - Otherwise, emit a fenced ```json block (pretty-printed).

use std::fs;
use std::path::Path;

use serde_json::Value;

use super::tabular::rows_to_markdown;
use super::ConvertError;

pub fn convert_json(path: &Path) -> Result<String, ConvertError> {
    let content = fs::read_to_string(path)?;
    convert_json_str(&content)
}

pub fn convert_json_str(content: &str) -> Result<String, ConvertError> {
    let value: Value = serde_json::from_str(content)
        .map_err(|e| ConvertError::Parse(format!("invalid JSON: {e}")))?;

    if let Some(table) = try_array_of_flat_objects(&value) {
        return Ok(table);
    }

    let pretty = serde_json::to_string_pretty(&value)
        .unwrap_or_else(|_| content.to_string());
    Ok(format!("```json\n{}\n```\n", pretty))
}

fn try_array_of_flat_objects(v: &Value) -> Option<String> {
    let arr = v.as_array()?;
    if arr.is_empty() || arr.len() > 1000 {
        return None;
    }

    let mut headers: Vec<String> = Vec::new();
    for item in arr {
        let obj = item.as_object()?;
        for (k, val) in obj {
            if val.is_object() || val.is_array() {
                return None;
            }
            if !headers.iter().any(|h| h == k) {
                headers.push(k.clone());
            }
        }
    }
    if headers.is_empty() {
        return None;
    }

    let mut rows: Vec<Vec<String>> = Vec::with_capacity(arr.len() + 1);
    rows.push(headers.clone());
    for item in arr {
        let obj = item.as_object().unwrap();
        let row: Vec<String> = headers
            .iter()
            .map(|h| match obj.get(h) {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Null) | None => String::new(),
                Some(other) => other.to_string(),
            })
            .collect();
        rows.push(row);
    }

    Some(rows_to_markdown(&rows))
}
