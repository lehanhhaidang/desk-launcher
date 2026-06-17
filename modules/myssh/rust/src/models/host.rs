use serde::{Deserialize, Serialize};

/// A saved SSH host. Secrets are never included here — only whether one exists.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: String,
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub group_id: Option<String>,
    /// "password" | "key" | "agent"
    pub auth_method: String,
    pub key_path: Option<String>,
    /// True when a password / passphrase is stored in the OS keyring.
    pub has_secret: bool,
    /// Optional bastion: connect to this host through another host (ProxyJump).
    pub jump_host_id: Option<String>,
    pub tags: Vec<String>,
    pub last_used: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Payload for create/update. `secret` is plaintext from the UI; it is written
/// to the OS keyring and never persisted in SQLite. On update, `None` leaves
/// the existing secret untouched.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInput {
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub group_id: Option<String>,
    pub auth_method: String,
    pub key_path: Option<String>,
    pub secret: Option<String>,
    pub jump_host_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
