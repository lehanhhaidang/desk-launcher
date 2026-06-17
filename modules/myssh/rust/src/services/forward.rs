//! Local port forwarding. Each running forward owns a dedicated SSH connection;
//! every accepted local TCP connection is tunnelled to dest over a
//! `direct-tcpip` channel.

use crate::error::{AppError, AppResult};
use crate::models::forward::Forward;
use crate::services::ssh_client::{connect_authenticated, ClientHandler, ConnectParams};
use rusqlite::Connection;
use russh::client::Handle;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
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

    let handle = Arc::new(connect_authenticated(db, &params, None).await?);

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

/// Remote (`-R`) forward: ask the server to listen on `bind_addr:bind_port`;
/// the client handler pumps each incoming connection to `dest_host:dest_port`
/// on this machine. Keeps the SSH connection alive until stopped.
pub async fn start_remote(
    db: Arc<Mutex<Connection>>,
    params: ConnectParams,
    def: Forward,
) -> AppResult<ForwardHandle> {
    let handle =
        connect_authenticated(db, &params, Some((def.dest_host.clone(), def.dest_port))).await?;
    handle
        .tcpip_forward(def.bind_addr.clone(), def.bind_port as u32)
        .await
        .map_err(|e| AppError::Ssh(format!("remote forward request: {e}")))?;

    let task = tokio::spawn(async move {
        // Hold the connection open; the handler services forwarded channels.
        let _keep = handle;
        std::future::pending::<()>().await;
    });
    Ok(ForwardHandle { task })
}

/// Dynamic (`-D`) forward: run a local SOCKS5 proxy; each CONNECT is tunnelled
/// to its target through a `direct-tcpip` channel.
pub async fn start_dynamic(
    db: Arc<Mutex<Connection>>,
    params: ConnectParams,
    def: Forward,
) -> AppResult<ForwardHandle> {
    let bind = format!("{}:{}", def.bind_addr, def.bind_port);
    let listener = TcpListener::bind(&bind)
        .await
        .map_err(|e| AppError::Ssh(format!("bind {bind}: {e}")))?;
    let handle = Arc::new(connect_authenticated(db, &params, None).await?);

    let task = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((socket, _peer)) => {
                    let h = handle.clone();
                    tokio::spawn(async move {
                        if let Err(e) = socks5_serve(socket, h).await {
                            log::debug!("myssh socks: {e}");
                        }
                    });
                }
                Err(e) => {
                    log::warn!("myssh socks: accept failed: {e}");
                    break;
                }
            }
        }
    });
    Ok(ForwardHandle { task })
}

/// Minimal SOCKS5 (no-auth, CONNECT only) handler tunnelling over the SSH
/// connection.
async fn socks5_serve(mut socket: TcpStream, handle: Arc<Handle<ClientHandler>>) -> std::io::Result<()> {
    // Greeting: VER, NMETHODS, METHODS…
    let mut head = [0u8; 2];
    socket.read_exact(&mut head).await?;
    if head[0] != 0x05 {
        return Ok(());
    }
    let mut methods = vec![0u8; head[1] as usize];
    socket.read_exact(&mut methods).await?;
    socket.write_all(&[0x05, 0x00]).await?; // select no-auth

    // Request: VER, CMD, RSV, ATYP, ADDR, PORT
    let mut req = [0u8; 4];
    socket.read_exact(&mut req).await?;
    if req[1] != 0x01 {
        socket.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await?; // cmd not supported
        return Ok(());
    }
    let host = match req[3] {
        0x01 => {
            let mut a = [0u8; 4];
            socket.read_exact(&mut a).await?;
            format!("{}.{}.{}.{}", a[0], a[1], a[2], a[3])
        }
        0x03 => {
            let mut len = [0u8; 1];
            socket.read_exact(&mut len).await?;
            let mut d = vec![0u8; len[0] as usize];
            socket.read_exact(&mut d).await?;
            String::from_utf8_lossy(&d).into_owned()
        }
        0x04 => {
            let mut a = [0u8; 16];
            socket.read_exact(&mut a).await?;
            a.chunks(2)
                .map(|c| format!("{:02x}{:02x}", c[0], c[1]))
                .collect::<Vec<_>>()
                .join(":")
        }
        _ => {
            socket.write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await?; // addr not supported
            return Ok(());
        }
    };
    let mut port_buf = [0u8; 2];
    socket.read_exact(&mut port_buf).await?;
    let port = u16::from_be_bytes(port_buf) as u32;

    match handle.channel_open_direct_tcpip(host, port, "127.0.0.1", 0).await {
        Ok(channel) => {
            socket.write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await?; // succeeded
            let mut stream = channel.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
        }
        Err(_) => {
            socket.write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await?; // connection refused
        }
    }
    Ok(())
}
