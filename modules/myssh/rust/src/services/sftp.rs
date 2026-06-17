//! SFTP over a dedicated SSH connection (one per browser session). Built on
//! `russh-sftp`, which runs the SFTP protocol over a russh channel stream.

use crate::error::{AppError, AppResult};
use crate::models::sftp::SftpEntry;
use crate::services::ssh_client::{connect_authenticated, ClientHandler, ConnectParams};
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const CHUNK: usize = 256 * 1024;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferEvent {
    id: String,
    name: String,
    transferred: u64,
    total: u64,
    done: bool,
    error: Option<String>,
}

fn emit_transfer(
    app: &AppHandle,
    id: &str,
    name: &str,
    transferred: u64,
    total: u64,
    done: bool,
    error: Option<String>,
) {
    let _ = app.emit(
        "myssh://transfer",
        TransferEvent { id: id.into(), name: name.into(), transferred, total, done, error },
    );
}

fn local_dir_size(path: &str) -> AppResult<u64> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)?.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            total += local_dir_size(&entry.path().to_string_lossy())?;
        } else {
            total += meta.len();
        }
    }
    Ok(total)
}

async fn remote_dir_size(sftp: &SftpSession, path: &str) -> AppResult<u64> {
    let mut total = 0u64;
    let rd = sftp
        .read_dir(path.to_string())
        .await
        .map_err(|e| AppError::Ssh(format!("read dir: {e}")))?;
    for entry in rd {
        if entry.file_type().is_dir() {
            total += Box::pin(remote_dir_size(sftp, &join_remote(path, &entry.file_name()))).await?;
        } else {
            total += entry.metadata().size.unwrap_or(0);
        }
    }
    Ok(total)
}

#[allow(clippy::too_many_arguments)]
async fn upload_file_p(app: &AppHandle, id: &str, name: &str, sftp: &SftpSession, local_path: &str, remote_path: String, total: u64, sent: &mut u64) -> AppResult<()> {
    let mut local = tokio::fs::File::open(local_path).await?;
    // russh-sftp's `write` opens WRITE-only (no CREATE); `create` truncates+creates.
    let mut remote = sftp.create(remote_path).await.map_err(|e| AppError::Ssh(format!("create: {e}")))?;
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = local.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        remote.write_all(&buf[..n]).await.map_err(|e| AppError::Ssh(format!("write: {e}")))?;
        *sent += n as u64;
        emit_transfer(app, id, name, *sent, total, false, None);
    }
    remote.flush().await.ok();
    remote.shutdown().await.ok();
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn upload_tree_p(app: &AppHandle, id: &str, name: &str, sftp: &SftpSession, local_dir: &str, remote_dir: &str, total: u64, sent: &mut u64) -> AppResult<()> {
    let _ = sftp.create_dir(remote_dir.to_string()).await;
    for entry in std::fs::read_dir(local_dir)?.flatten() {
        let fname = entry.file_name().to_string_lossy().into_owned();
        let lp = entry.path().to_string_lossy().into_owned();
        let rp = join_remote(remote_dir, &fname);
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            Box::pin(upload_tree_p(app, id, name, sftp, &lp, &rp, total, sent)).await?;
        } else {
            upload_file_p(app, id, name, sftp, &lp, rp, total, sent).await?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_file_p(app: &AppHandle, id: &str, name: &str, sftp: &SftpSession, remote_path: String, local_path: &str, total: u64, sent: &mut u64) -> AppResult<()> {
    let mut remote = sftp.open(remote_path).await.map_err(|e| AppError::Ssh(format!("open: {e}")))?;
    let mut local = tokio::fs::File::create(local_path).await?;
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = remote.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        local.write_all(&buf[..n]).await?;
        *sent += n as u64;
        emit_transfer(app, id, name, *sent, total, false, None);
    }
    local.flush().await.ok();
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_tree_p(app: &AppHandle, id: &str, name: &str, sftp: &SftpSession, remote_dir: &str, local_dir: &str, total: u64, sent: &mut u64) -> AppResult<()> {
    std::fs::create_dir_all(local_dir)?;
    let rd = sftp.read_dir(remote_dir.to_string()).await.map_err(|e| AppError::Ssh(format!("read dir: {e}")))?;
    for entry in rd {
        let fname = entry.file_name();
        let rp = join_remote(remote_dir, &fname);
        let lp = join_local(local_dir, &fname);
        if entry.file_type().is_dir() {
            Box::pin(download_tree_p(app, id, name, sftp, &rp, &lp, total, sent)).await?;
        } else {
            download_file_p(app, id, name, sftp, rp, &lp, total, sent).await?;
        }
    }
    Ok(())
}

/// Upload a file or directory, streaming in chunks and emitting progress on
/// `myssh://transfer`.
pub async fn upload_progress(app: AppHandle, id: String, name: String, sftp: &SftpSession, local_path: String, remote_path: String, is_dir: bool) -> AppResult<()> {
    let total = if is_dir {
        local_dir_size(&local_path)?
    } else {
        std::fs::metadata(&local_path)?.len()
    };
    let mut sent = 0u64;
    emit_transfer(&app, &id, &name, 0, total, false, None);
    let result = if is_dir {
        upload_tree_p(&app, &id, &name, sftp, &local_path, &remote_path, total, &mut sent).await
    } else {
        upload_file_p(&app, &id, &name, sftp, &local_path, remote_path, total, &mut sent).await
    };
    emit_transfer(&app, &id, &name, sent, total, true, result.as_ref().err().map(|e| e.to_string()));
    result
}

/// Download a file or directory, streaming in chunks and emitting progress.
pub async fn download_progress(app: AppHandle, id: String, name: String, sftp: &SftpSession, remote_path: String, local_path: String, is_dir: bool) -> AppResult<()> {
    let total = if is_dir {
        remote_dir_size(sftp, &remote_path).await?
    } else {
        sftp.metadata(remote_path.clone())
            .await
            .map_err(|e| AppError::Ssh(format!("stat: {e}")))?
            .size
            .unwrap_or(0)
    };
    let mut sent = 0u64;
    emit_transfer(&app, &id, &name, 0, total, false, None);
    let result = if is_dir {
        download_tree_p(&app, &id, &name, sftp, &remote_path, &local_path, total, &mut sent).await
    } else {
        download_file_p(&app, &id, &name, sftp, remote_path, &local_path, total, &mut sent).await
    };
    emit_transfer(&app, &id, &name, sent, total, true, result.as_ref().err().map(|e| e.to_string()));
    result
}

/// A live SFTP session. The russh `Handle` is held so the underlying SSH
/// connection stays open for the session's lifetime.
pub struct SftpHandle {
    _ssh: Handle<ClientHandler>,
    _jumps: Vec<Handle<ClientHandler>>,
    /// `Arc` so a transfer can clone it and release the sessions-map lock,
    /// letting browsing continue while a large transfer runs.
    pub sftp: Arc<SftpSession>,
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
    Ok((SftpHandle { _ssh: ssh, _jumps: jumps, sftp: Arc::new(sftp) }, home))
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
