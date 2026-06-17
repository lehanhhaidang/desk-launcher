use serde::{Deserialize, Serialize};

/// A persisted port-forward definition. v1 supports `kind = "local"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Forward {
    pub id: String,
    pub host_id: String,
    pub kind: String,
    pub bind_addr: String,
    pub bind_port: u16,
    pub dest_host: String,
    pub dest_port: u16,
    pub label: String,
    pub auto_start: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardInput {
    pub host_id: String,
    pub kind: String,
    pub bind_addr: String,
    pub bind_port: u16,
    pub dest_host: String,
    pub dest_port: u16,
    pub label: String,
    #[serde(default)]
    pub auto_start: bool,
}

/// A forward definition plus whether it is currently running.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardStatus {
    pub forward: Forward,
    pub running: bool,
}
