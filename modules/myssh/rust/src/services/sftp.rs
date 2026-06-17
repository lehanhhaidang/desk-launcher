//! SFTP over a dedicated SSH connection (one per browser session). Built on
//! `russh-sftp`, which runs the SFTP protocol over a russh channel stream.

use crate::error::{AppError, AppResult};
use crate::models::sftp::SftpEntry;
use crate::services::ssh_client::{connect_authenticated, ClientHandler, ConnectParams};
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

/// Write a file to the remote, creating/truncating it. `SftpSession::write`
/// opens with WRITE only (no CREATE), so it fails on new files — use `create`.
pub async fn write_file(sftp: &SftpSession, remote_path: String, data: &[u8]) -> AppResult<()> {
    let mut file = sftp
        .create(remote_path)
        .await
        .map_err(|e| AppError::Ssh(format!("create: {e}")))?;
    file.write_all(data)
        .await
        .map_err(|e| AppError::Ssh(format!("write: {e}")))?;
    file.flush().await.ok();
    file.shutdown().await.ok();
    Ok(())
}

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

/// Recursively upload a local directory tree to `remote_dir`.
pub async fn upload_dir(sftp: &SftpSession, local_dir: &str, remote_dir: &str) -> AppResult<()> {
    let _ = sftp.create_dir(remote_dir.to_string()).await; // ignore "already exists"
    for entry in std::fs::read_dir(local_dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let local_path = entry.path().to_string_lossy().into_owned();
        let remote_path = join_remote(remote_dir, &name);
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            Box::pin(upload_dir(sftp, &local_path, &remote_path)).await?;
        } else {
            let data = std::fs::read(&local_path)?;
            write_file(sftp, remote_path, &data).await?;
        }
    }
    Ok(())
}

/// Recursively download a remote directory tree to `local_dir`.
pub async fn download_dir(sftp: &SftpSession, remote_dir: &str, local_dir: &str) -> AppResult<()> {
    std::fs::create_dir_all(local_dir)?;
    let read_dir = sftp
        .read_dir(remote_dir.to_string())
        .await
        .map_err(|e| AppError::Ssh(format!("read dir: {e}")))?;
    for entry in read_dir {
        let name = entry.file_name();
        let remote_path = join_remote(remote_dir, &name);
        let local_path = join_local(local_dir, &name);
        if entry.file_type().is_dir() {
            Box::pin(download_dir(sftp, &remote_path, &local_path)).await?;
        } else {
            let data = sftp
                .read(remote_path)
                .await
                .map_err(|e| AppError::Ssh(format!("download {name}: {e}")))?;
            std::fs::write(&local_path, data)?;
        }
    }
    Ok(())
}

fn join_remote(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}
fn join_local(dir: &str, name: &str) -> String {
    format!("{}\\{}", dir.trim_end_matches(['\\', '/']), name)
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
