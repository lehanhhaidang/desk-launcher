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
