use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceInput {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

impl Workspace {
    pub fn new(name: String, icon: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            icon,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_new_generates_uuid() {
        let ws = Workspace::new("Test".into(), None);
        assert!(!ws.id.is_empty());
        assert_eq!(ws.name, "Test");
        assert_eq!(ws.sort_order, 0);
    }

    #[test]
    fn test_workspace_serializes_to_json() {
        let ws = Workspace::new("My Space".into(), Some("📁".into()));
        let json = serde_json::to_value(&ws).unwrap();
        assert_eq!(json["name"], "My Space");
        assert_eq!(json["icon"], "📁");
    }
}
