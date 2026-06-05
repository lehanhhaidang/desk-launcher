//! Plain text and Markdown pass-through with encoding detection.

use std::fs;
use std::path::Path;

use super::ConvertError;

pub fn convert_txt(path: &Path) -> Result<String, ConvertError> {
    let bytes = fs::read(path)?;
    Ok(decode(&bytes))
}

pub fn convert_md(path: &Path) -> Result<String, ConvertError> {
    // Markdown is already Markdown — just normalize encoding.
    let bytes = fs::read(path)?;
    Ok(decode(&bytes))
}

fn decode(bytes: &[u8]) -> String {
    // Strip UTF-8 BOM if present, else fall back to Windows-1252 only when
    // the byte stream is not valid UTF-8.
    let stripped = match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => rest,
        other => other,
    };

    match std::str::from_utf8(stripped) {
        Ok(s) => s.to_string(),
        Err(_) => {
            let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(stripped);
            cow.into_owned()
        }
    }
}
