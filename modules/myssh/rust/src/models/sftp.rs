use serde::Serialize;

/// One entry in a remote directory listing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Modification time, seconds since the Unix epoch.
    pub modified: Option<i64>,
}

/// Returned by `sftp_open`: the session id plus the resolved home directory.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpOpened {
    pub sftp_id: String,
    pub home: String,
}

/// Text content of a file for preview, or a flag explaining why not.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub content: Option<String>,
    pub is_binary: bool,
    pub too_large: bool,
    pub size: u64,
}

/// Files larger than this are not previewed inline.
pub const MAX_PREVIEW: u64 = 2 * 1024 * 1024;

/// Decide whether bytes are previewable text (UTF-8, no NUL bytes) and build
/// the result.
pub fn make_preview(bytes: Vec<u8>, size: u64, too_large: bool) -> FilePreview {
    if too_large {
        return FilePreview { content: None, is_binary: false, too_large: true, size };
    }
    if bytes.contains(&0) {
        return FilePreview { content: None, is_binary: true, too_large: false, size };
    }
    match String::from_utf8(bytes) {
        Ok(text) => FilePreview { content: Some(text), is_binary: false, too_large: false, size },
        Err(_) => FilePreview { content: None, is_binary: true, too_large: false, size },
    }
}
