use serde::{Deserialize, Serialize};

/// A saved command string that can be sent to the active session.
/// `host_id` scopes it to one host; `None` makes it available everywhere.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub host_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetInput {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub host_id: Option<String>,
}
