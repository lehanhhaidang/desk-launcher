//! Local port forwarding. Each running forward owns a dedicated SSH connection;
//! every accepted local TCP connection is tunnelled to dest over a
//! `direct-tcpip` channel.

use crate::error::{AppError, AppResult};
use crate::models::forward::Forward;
use crate::services::ssh_client::{connect_authenticated, ConnectParams};
use rusqlite::Connection;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

/// Handle to a running forward — aborting the task drops the listener and the
/// dedicated SSH connection.
pub struct ForwardHandle {
    task: tokio::task::JoinHandle<()>,
}

impl ForwardHandle {
    pub fn stop(self) {
        self.task.abort();
    }
}

/// Bind `bind_addr:bind_port` locally and tunnel each connection to
/// `dest_host:dest_port` over a fresh authenticated SSH session.
pub async fn start_local(
    db: Arc<Mutex<Connection>>,
    params: ConnectParams,
    def: Forward,
) -> AppResult<ForwardHandle> {
    let bind = format!("{}:{}", def.bind_addr, def.bind_port);
    let listener = TcpListener::bind(&bind)
        .await
        .map_err(|e| AppError::Ssh(format!("bind {bind}: {e}")))?;

    let handle = Arc::new(connect_authenticated(db, &params).await?);

    let task = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((mut socket, _peer)) => {
                    let h = handle.clone();
                    let dest_host = def.dest_host.clone();
                    let dest_port = def.dest_port as u32;
                    tokio::spawn(async move {
                        match h
                            .channel_open_direct_tcpip(dest_host, dest_port, "127.0.0.1", 0)
                            .await
                        {
                            Ok(channel) => {
                                let mut stream = channel.into_stream();
                                let _ =
                                    tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
                            }
                            Err(e) => log::warn!("myssh forward: open channel failed: {e}"),
                        }
                    });
                }
                Err(e) => {
                    log::warn!("myssh forward: accept failed: {e}");
                    break;
                }
            }
        }
    });

    Ok(ForwardHandle { task })
}
