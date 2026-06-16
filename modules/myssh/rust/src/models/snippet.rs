use serde::{Deserialize, Serialize};

/// A saved command string that can be sent to the active session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SnippetInput {
    pub name: String,
    pub command: String,
}
