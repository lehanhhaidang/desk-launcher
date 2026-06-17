//! All `russh` usage is isolated here. The rest of the crate talks to SSH
//! sessions only through `open()` / `connect_authenticated()` and the
//! `SessionRequest` channel `open()` returns.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use russh::client::{self, Handle, Msg, Session};
use russh::keys::{ssh_key, PrivateKeyWithHashAlg};
use russh::{Channel, ChannelMsg};
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
#[derive(Clone)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub key_path: Option<String>,
    pub secret: Option<String>,
    /// Optional bastion to tunnel this connection through (ProxyJump).
    pub jump: Option<Box<ConnectParams>>,
}

/// Resolve a host id into connection params, pulling its secret from the keyring
/// and (one level) its ProxyJump host. Used by sessions, SFTP, and forwards.
pub(crate) async fn resolve_params(
    db: Arc<Mutex<Connection>>,
    host_id: &str,
) -> AppResult<ConnectParams> {
    resolve_params_inner(db, host_id, true).await
}

async fn resolve_params_inner(
    db: Arc<Mutex<Connection>>,
    host_id: &str,
    allow_jump: bool,
) -> AppResult<ConnectParams> {
    let host = {
        let conn = db.lock().await;
        crate::db::host_repo::get(&conn, host_id)?
    };
    let secret = if host.has_secret {
        crate::utils::secret_store::get_host_secret(&host.id)?
    } else {
        None
    };
    let jump = match (allow_jump, &host.jump_host_id) {
        (true, Some(jid)) => {
            Some(Box::new(Box::pin(resolve_params_inner(db.clone(), jid, false)).await?))
        }
        _ => None,
    };
    Ok(ConnectParams {
        host: host.hostname,
        port: host.port,
        username: host.username,
        auth_method: host.auth_method,
        key_path: host.key_path,
        secret,
        jump,
    })
}

/// Client handler. Its only job is trust-on-first-use host-key verification:
/// an unknown (host, port) is recorded and accepted; a changed key is rejected
/// (possible MITM) until the stored entry is cleared.
pub(crate) struct ClientHandler {
    db: Arc<Mutex<Connection>>,
    host: String,
    port: u16,
    /// For remote (`-R`) forwards: the local destination that incoming
    /// server-forwarded connections are pumped to.
    remote_dest: Option<(String, u16)>,
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

    /// A connection hit a server-side forwarded port (remote `-R` forward):
    /// dial the configured local destination and pump bytes both ways.
    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        _connected_address: &str,
        _connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        if let Some((host, port)) = self.remote_dest.clone() {
            tokio::spawn(async move {
                match tokio::net::TcpStream::connect((host.as_str(), port)).await {
                    Ok(mut tcp) => {
                        let mut stream = channel.into_stream();
                        let _ = tokio::io::copy_bidirectional(&mut tcp, &mut stream).await;
                    }
                    Err(e) => log::warn!("myssh remote forward: dial local dest failed: {e}"),
                }
            });
        }
        Ok(())
    }
}

/// Connect to the OS SSH agent (Windows OpenSSH named pipe; `SSH_AUTH_SOCK`
/// elsewhere).
#[cfg(windows)]
async fn connect_ssh_agent() -> AppResult<
    russh::keys::agent::client::AgentClient<tokio::net::windows::named_pipe::NamedPipeClient>,
> {
    russh::keys::agent::client::AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent")
        .await
        .map_err(|e| AppError::Ssh(format!("connect ssh-agent (is the OpenSSH agent running?): {e}")))
}

#[cfg(not(windows))]
async fn connect_ssh_agent(
) -> AppResult<russh::keys::agent::client::AgentClient<tokio::net::UnixStream>> {
    russh::keys::agent::client::AgentClient::connect_env()
        .await
        .map_err(|e| AppError::Ssh(format!("connect ssh-agent: {e}")))
}

/// Connect + authenticate, returning the live session handle. Shared by the
/// interactive terminal and by port forwarding.
pub(crate) async fn connect_authenticated(
    db: Arc<Mutex<Connection>>,
    params: &ConnectParams,
    remote_dest: Option<(String, u16)>,
) -> AppResult<(Handle<ClientHandler>, Vec<Handle<ClientHandler>>)> {
    let mut config = client::Config::default();
    // Send a keepalive every 30s so idle sessions aren't dropped by the server
    // or a NAT/firewall; disconnect after a few unanswered ones (keepalive_max).
    config.keepalive_interval = Some(std::time::Duration::from_secs(30));
    let config = Arc::new(config);
    let handler = ClientHandler {
        db: db.clone(),
        host: params.host.clone(),
        port: params.port,
        remote_dest,
    };

    // `jumps` holds any bastion connections that must stay alive for as long as
    // this session does (the caller keeps them).
    let (mut handle, jumps) = match &params.jump {
        Some(jump) => {
            let (jump_handle, mut prior) =
                Box::pin(connect_authenticated(db.clone(), jump, None)).await?;
            let channel = jump_handle
                .channel_open_direct_tcpip(params.host.clone(), params.port as u32, "127.0.0.1", 0)
                .await
                .map_err(|e| AppError::Ssh(format!("jump channel: {e}")))?;
            let handle = client::connect_stream(config, channel.into_stream(), handler)
                .await
                .map_err(|e| AppError::Ssh(format!("connect via jump host: {e}")))?;
            prior.push(jump_handle);
            (handle, prior)
        }
        None => {
            let handle = client::connect(config, (params.host.as_str(), params.port), handler)
                .await
                .map_err(|e| AppError::Ssh(format!("connect failed: {e}")))?;
            (handle, Vec::new())
        }
    };

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
        "agent" => {
            let mut agent = connect_ssh_agent().await?;
            let identities = agent
                .request_identities()
                .await
                .map_err(|e| AppError::Ssh(format!("list agent identities: {e}")))?;
            let mut ok = false;
            for id in identities {
                if let russh::keys::agent::AgentIdentity::PublicKey { key, .. } = id {
                    match handle
                        .authenticate_publickey_with(params.username.clone(), key, None, &mut agent)
                        .await
                    {
                        Ok(result) if result.success() => {
                            ok = true;
                            break;
                        }
                        Ok(_) => {}
                        Err(e) => return Err(AppError::Ssh(format!("agent auth: {e}"))),
                    }
                }
            }
            ok
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

    Ok((handle, jumps))
}

/// Open an interactive shell and spawn the driver task. Returns the sender used
/// to push input/resize/close to that task. Output is emitted to the frontend
/// as `myssh://data/<session_id>` (raw bytes) and the session end as
/// `myssh://exit/<session_id>`.
pub async fn open(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    session_id: String,
    params: ConnectParams,
    cols: u32,
    rows: u32,
) -> AppResult<mpsc::Sender<SessionRequest>> {
    let (handle, jumps) = connect_authenticated(db, &params, None).await?;

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
        // Hold the session handle (and any bastion hops) alive for the channel's lifetime.
        let _handle = handle;
        let _jumps = jumps;
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
