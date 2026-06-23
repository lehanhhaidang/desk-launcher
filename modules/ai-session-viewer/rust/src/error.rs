//! Error type for the AI Session Viewer plugin.
//!
//! Commands surface errors to the frontend as plain strings (via
//! `Display`), so this stays intentionally small.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ViewerError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("path does not exist: {0}")]
    NotFound(String),
    #[error("not a directory: {0}")]
    NotDir(String),
}

pub type Result<T> = std::result::Result<T, ViewerError>;
