//! File-format → Markdown converters.
//!
//! Each submodule handles one format. The dispatcher routes by the
//! normalized extension string produced by `detect_format` in `lib.rs`.
//!
//! Conventions:
//!   - Output is always UTF-8.
//!   - Converters return `Result<String, ConvertError>`.
//!   - Headings, lists, tables are emitted as standard CommonMark.

use std::path::Path;

mod docx;
mod epub;
mod html;
mod ipynb;
mod json;
mod pdf;
mod plain;
mod pptx;
mod tabular;
mod xlsx;
mod xml;
mod zip;

#[derive(Debug)]
pub enum ConvertError {
    Io(std::io::Error),
    Parse(String),
    Unsupported(String),
}

impl From<std::io::Error> for ConvertError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

pub fn convert_path(path: &Path, format: &str) -> Result<String, ConvertError> {
    match format {
        "txt" => plain::convert_txt(path),
        "md" => plain::convert_md(path),
        "csv" => tabular::convert_csv(path),
        "json" => json::convert_json(path),
        "xml" => xml::convert_xml(path),
        "html" => html::convert_html_file(path),
        "docx" => docx::convert_docx(path),
        "xlsx" | "xls" => xlsx::convert_xlsx(path),
        "pptx" => pptx::convert_pptx(path),
        "pdf" => pdf::convert_pdf(path),
        "epub" => epub::convert_epub(path),
        "ipynb" => ipynb::convert_ipynb(path),
        "zip" => zip::convert_zip(path),
        other => Err(ConvertError::Unsupported(other.to_string())),
    }
}

pub fn convert_text(content: &str, format: &str) -> Result<String, ConvertError> {
    match format {
        "txt" | "md" => Ok(content.to_string()),
        "csv" => tabular::convert_csv_str(content),
        "json" => json::convert_json_str(content),
        "xml" => xml::convert_xml_str(content),
        "html" => html::convert_html_str(content),
        other => Err(ConvertError::Unsupported(other.to_string())),
    }
}
