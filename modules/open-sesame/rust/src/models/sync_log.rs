use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncLogStatus {
    Success,
    Conflict,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLog {
    pub id: String,
    pub doc_set_id: String,
    pub direction: String, // "up" or "down"
    pub commit_hash: Option<String>,
    pub message: Option<String>,
    pub files_count: i32,
    pub status: SyncLogStatus,
    pub error_msg: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl SyncLog {
    pub fn new(
        doc_set_id: String,
        direction: String,
        commit_hash: Option<String>,
        message: Option<String>,
        files_count: i32,
        status: SyncLogStatus,
        error_msg: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            doc_set_id,
            direction,
            commit_hash,
            message,
            files_count,
            status,
            error_msg,
            created_at: Utc::now(),
        }
    }
}
