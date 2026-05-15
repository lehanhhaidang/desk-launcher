//! Port Killer Tauri plugin — pure Rust.
//!
//! Commands:
//!   - `list_ports` → returns all listening/established TCP+UDP sockets
//!   - `kill_ports` → kills a list of PIDs, reports per-PID success
//!
//! SSH tunnels are stubbed (return empty / no-op) until we add `russh`
//! support in a later iteration. The frontend's TunnelManager UI will
//! render with an empty list and the relevant buttons no-op for now.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Wry;

use netstat2::{
    AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, SocketInfo, TcpState,
    get_sockets_info,
};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct PortEntry {
    pub pid: u32,
    pub name: String,
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: String,
    pub status: String,
    pub family: String,
}

#[derive(Debug, Serialize)]
pub struct KillResult {
    pub pid: u32,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KillRequest {
    pub pids: Vec<u32>,
}

#[tauri::command]
fn list_ports() -> Result<Vec<PortEntry>, String> {
    let flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let protos = ProtocolFlags::TCP | ProtocolFlags::UDP;
    let sockets =
        get_sockets_info(flags, protos).map_err(|e| format!("netstat: {e}"))?;

    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut seen: HashSet<(u32, u16)> = HashSet::new();
    let mut out: Vec<PortEntry> = Vec::new();

    for SocketInfo {
        protocol_socket_info,
        associated_pids,
        ..
    } in sockets
    {
        let pid = match associated_pids.first() {
            Some(p) => *p,
            None => continue,
        };
        let (family_str, local_addr, local_port, remote, status) =
            match protocol_socket_info {
                ProtocolSocketInfo::Tcp(t) => {
                    if !matches!(t.state, TcpState::Listen | TcpState::Established) {
                        continue;
                    }
                    let family = if t.local_addr.is_ipv4() { "IPv4" } else { "IPv6" };
                    let remote =
                        format!("{}:{}", t.remote_addr, t.remote_port);
                    let status = match t.state {
                        TcpState::Listen => "LISTEN",
                        TcpState::Established => "ESTABLISHED",
                        _ => "OTHER",
                    };
                    (
                        family,
                        t.local_addr.to_string(),
                        t.local_port,
                        remote,
                        status,
                    )
                }
                ProtocolSocketInfo::Udp(u) => {
                    let family = if u.local_addr.is_ipv4() { "IPv4" } else { "IPv6" };
                    (
                        family,
                        u.local_addr.to_string(),
                        u.local_port,
                        String::new(),
                        "LISTEN",
                    )
                }
            };

        if !seen.insert((pid, local_port)) {
            continue;
        }

        let name = sys
            .process(Pid::from_u32(pid))
            .map(|p| p.name().to_string_lossy().into_owned())
            .unwrap_or_else(|| "Unknown".into());

        out.push(PortEntry {
            pid,
            name,
            local_address: local_addr,
            local_port,
            remote_address: remote,
            status: status.into(),
            family: family_str.into(),
        });
    }

    out.sort_by_key(|p| p.local_port);
    Ok(out)
}

#[tauri::command]
fn kill_ports(request: KillRequest) -> Vec<KillResult> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    request
        .pids
        .into_iter()
        .map(|pid| match sys.process(Pid::from_u32(pid)) {
            Some(p) => {
                if p.kill() {
                    log::info!(
                        "killed pid {} ({})",
                        pid,
                        p.name().to_string_lossy()
                    );
                    KillResult { pid, success: true, error: None }
                } else {
                    KillResult {
                        pid,
                        success: false,
                        error: Some("kill returned false (access denied?)".into()),
                    }
                }
            }
            None => KillResult {
                pid,
                success: false,
                error: Some("process not found".into()),
            },
        })
        .collect()
}

// ---- SSH tunnel stubs (TODO: implement with russh) ----

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TunnelConfig {
    pub id: String,
    pub label: String,
    pub ssh_user: String,
    pub ssh_host: String,
    pub ssh_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub extra_args: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct TunnelStatus {
    pub id: String,
    pub config: TunnelConfig,
    pub is_running: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
    pub command: Option<String>,
}

#[tauri::command]
fn list_tunnels() -> Vec<TunnelStatus> {
    Vec::new()
}

#[tauri::command]
fn create_tunnel(_config: TunnelConfig) -> Result<TunnelStatus, String> {
    Err("SSH tunnels chưa hỗ trợ — sẽ thêm bằng russh ở version sau".into())
}

#[tauri::command]
fn update_tunnel(_id: String, _config: TunnelConfig) -> Result<TunnelStatus, String> {
    Err("SSH tunnels chưa hỗ trợ".into())
}

#[tauri::command]
fn delete_tunnel(_id: String) -> Result<(), String> {
    Err("SSH tunnels chưa hỗ trợ".into())
}

#[tauri::command]
fn start_tunnel(_id: String) -> Result<TunnelStatus, String> {
    Err("SSH tunnels chưa hỗ trợ".into())
}

#[tauri::command]
fn stop_tunnel(_id: String) -> Result<TunnelStatus, String> {
    Err("SSH tunnels chưa hỗ trợ".into())
}

#[derive(Debug, Serialize)]
pub struct SshKey {
    pub name: String,
    pub path: String,
}

#[tauri::command]
fn list_ssh_keys() -> Vec<SshKey> {
    Vec::new()
}

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("port-killer")
        .invoke_handler(tauri::generate_handler![
            list_ports,
            kill_ports,
            list_tunnels,
            create_tunnel,
            update_tunnel,
            delete_tunnel,
            start_tunnel,
            stop_tunnel,
            list_ssh_keys,
        ])
        .setup(|_app, _api| {
            log::info!("port-killer plugin initialized (Rust)");
            Ok(())
        })
        .build()
}
