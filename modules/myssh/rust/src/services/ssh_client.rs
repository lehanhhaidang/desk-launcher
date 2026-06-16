//! All `russh` usage is isolated here. The rest of the crate talks to SSH
//! sessions only through `open()` and the `SessionRequest` channel it returns.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use russh::client;
use russh::keys::{ssh_key, PrivateKeyWithHashAlg};
use russh::ChannelMsg;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

/// Messages the UI sends to a live session's driver task.
pub enum SessionRequest {
    Input(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

/// Everything needed to dial a host, already resolved (secret pulled from the
/// keyring by the caller).
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub key_path: Option<String>,
    pub secret: Option<String>,
}

/// Client handler. Its only job is trust-on-first-use host-key verification:
/// an unknown (host, port) is recorded and accepted; a changed key is rejected
/// (possible MITM) until the stored entry is cleared.
struct ClientHandler {
    db: Arc<Mutex<Connection>>,
    host: String,
    port: u16,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key
            .fingerprint(ssh_key::HashAlg::Sha256)
            .to_string();
        let key_type = server_public_key.algorithm().to_string();
        let conn = self.db.lock().await;
        match crate::db::known_hosts_repo::get(&conn, &self.host, self.port) {
            Ok(Some(existing)) => Ok(existing == fingerprint),
            Ok(None) => {
                let _ = crate::db::known_hosts_repo::insert(
                    &conn,
                    &self.host,
                    self.port,
                    &key_type,
                    &fingerprint,
                );
                Ok(true)
            }
            Err(_) => Ok(false),
        }
    }
}

/// Connect, authenticate, open an interactive shell, and spawn the driver task.
/// Returns the sender used to push input/resize/close to that task. Output is
/// emitted to the frontend as `myssh://data/<session_id>` (raw bytes) and the
/// session end as `myssh://exit/<session_id>`.
pub async fn open(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    session_id: String,
    params: ConnectParams,
    cols: u32,
    rows: u32,
) -> AppResult<mpsc::Sender<SessionRequest>> {
    let config = Arc::new(client::Config::default());
    let handler = ClientHandler {
        db: db.clone(),
        host: params.host.clone(),
        port: params.port,
    };

    let mut handle = client::connect(config, (params.host.as_str(), params.port), handler)
        .await
        .map_err(|e| AppError::Ssh(format!("connect failed: {e}")))?;

    let authenticated = match params.auth_method.as_str() {
        "key" => {
            let path = params
                .key_path
                .clone()
                .ok_or_else(|| AppError::Validation("a key file is required for key auth".into()))?;
            let key = russh::keys::load_secret_key(&path, params.secret.as_deref())
                .map_err(|e| AppError::Ssh(format!("load key: {e}")))?;
            let hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| AppError::Ssh(format!("rsa hash negotiation: {e}")))?
                .flatten();
            handle
                .authenticate_publickey(
                    params.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                )
                .await
                .map_err(|e| AppError::Ssh(format!("auth: {e}")))?
                .success()
        }
        _ => {
            let password = params.secret.clone().unwrap_or_default();
            handle
                .authenticate_password(params.username.clone(), password)
                .await
                .map_err(|e| AppError::Ssh(format!("auth: {e}")))?
                .success()
        }
    };

    if !authenticated {
        return Err(AppError::Ssh("authentication failed".into()));
    }

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("open channel: {e}")))?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| AppError::Ssh(format!("request pty: {e}")))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| AppError::Ssh(format!("request shell: {e}")))?;

    let (mut read_half, write_half) = channel.split();
    let (tx, mut rx) = mpsc::channel::<SessionRequest>(256);

    let data_event = format!("myssh://data/{session_id}");
    let exit_event = format!("myssh://exit/{session_id}");

    tokio::spawn(async move {
        // Hold the session handle alive for the channel's lifetime.
        let _handle = handle;
        loop {
            tokio::select! {
                msg = read_half.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) => {
                            let _ = app.emit(&data_event, data.to_vec());
                        }
                        Some(ChannelMsg::ExtendedData { data, .. }) => {
                            let _ = app.emit(&data_event, data.to_vec());
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                        _ => {}
                    }
                }
                req = rx.recv() => {
                    match req {
                        Some(SessionRequest::Input(bytes)) => {
                            if write_half.data(&bytes[..]).await.is_err() {
                                break;
                            }
                        }
                        Some(SessionRequest::Resize { cols, rows }) => {
                            let _ = write_half.window_change(cols, rows, 0, 0).await;
                        }
                        Some(SessionRequest::Close) | None => break,
                    }
                }
            }
        }
        let _ = app.emit(&exit_event, ());
    });

    Ok(tx)
}
