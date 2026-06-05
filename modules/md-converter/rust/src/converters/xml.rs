//! XML → Markdown: pretty-print inside a fenced ```xml block.

use std::fs;
use std::path::Path;

use super::ConvertError;

pub fn convert_xml(path: &Path) -> Result<String, ConvertError> {
    let content = fs::read_to_string(path)?;
    convert_xml_str(&content)
}

pub fn convert_xml_str(content: &str) -> Result<String, ConvertError> {
    Ok(format!("```xml\n{}\n```\n", content.trim_end()))
}
