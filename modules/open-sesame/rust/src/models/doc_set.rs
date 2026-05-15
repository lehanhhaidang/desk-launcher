use crate::models::account::ProviderType;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Standalone,
    Mirrored,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DocSetStatus {
    Idle,
    Syncing,
    Pending,
    Conflict,
    Error,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocSet {
    pub id: String,
    pub workspace_id: String,
    pub account_id: String,
    pub display_name: String,
    pub source_path: String,
    pub strategy: Strategy,
    pub mirror_path: Option<String>,
    pub provider_type: ProviderType,
    pub remote_url: Option<String>,
    pub remote_id: Option<String>,
    pub branch: String,
    pub auto_sync: bool,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub last_commit: Option<String>,
    pub status: DocSetStatus,
    pub has_mapping: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocSetInput {
    pub workspace_id: String,
    pub account_id: String,
    pub display_name: String,
    pub source_path: String,
    pub provider_type: ProviderType,
    pub remote_url: Option<String>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GithubRemoteMode {
    Create,
    Link,
}

#[derive(Debug, Deserialize)]
pub struct SetupGithubRemoteInput {
    pub doc_set_id: String,
    pub mode: GithubRemoteMode,
    pub repo_name: Option<String>,
    pub remote_url: Option<String>,
    pub private: bool,
}

#[derive(Debug, Deserialize)]
pub struct ImportGithubDocSetInput {
    pub workspace_id: String,
    pub account_id: String,
    pub remote_url: String,
    pub display_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strategy_serde() {
        let json = serde_json::to_string(&Strategy::Mirrored).unwrap();
        assert_eq!(json, "\"mirrored\"");
        let parsed: Strategy = serde_json::from_str("\"standalone\"").unwrap();
        assert_eq!(parsed, Strategy::Standalone);
    }
}
