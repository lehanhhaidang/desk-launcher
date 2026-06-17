//! SFTP over a dedicated SSH connection (one per browser session). Built on
//! `russh-sftp`, which runs the SFTP protocol over a russh channel stream.

use crate::error::{AppError, AppResult};
use crate::models::sftp::SftpEntry;
use crate::services::ssh_client::{connect_authenticated, ClientHandler, ConnectParams};
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use tauri::AppHandle;

/// A live SFTP session. The russh `Handle` is held so the underlying SSH
/// connection stays open for the session's lifetime.
pub struct SftpHandle {
    _ssh: Handle<ClientHandler>,
    _jumps: Vec<Handle<ClientHandler>>,
    pub sftp: SftpSession,
}

/// Connect, request the `sftp` subsystem, and return the session + home dir.
pub async fn open(
    app: AppHandle,
    params: &ConnectParams,
) -> AppResult<(SftpHandle, String)> {
    let (ssh, jumps) = connect_authenticated(app, params, None).await?;
    let channel = ssh
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("open channel: {e}")))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| AppError::Ssh(format!("request sftp subsystem: {e}")))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| AppError::Ssh(format!("sftp init: {e}")))?;
    let home = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".to_string());
    Ok((SftpHandle { _ssh: ssh, _jumps: jumps, sftp }, home))
}

/// List a remote directory, directories first then case-insensitive by name.
pub async fn list(sftp: &SftpSession, path: &str) -> AppResult<Vec<SftpEntry>> {
    let read_dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| AppError::Ssh(format!("read dir: {e}")))?;
    let mut out = Vec::new();
    for entry in read_dir {
        let ft = entry.file_type();
        let md = entry.metadata();
        out.push(SftpEntry {
            name: entry.file_name(),
            path: entry.path(),
            is_dir: ft.is_dir(),
            is_symlink: ft.is_symlink(),
            size: md.size.unwrap_or(0),
            modified: md.mtime.map(|m| m as i64),
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}
