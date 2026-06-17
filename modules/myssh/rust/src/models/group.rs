use serde::{Deserialize, Serialize};

/// A flat folder used to organize hosts in the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GroupInput {
    pub name: String,
}
