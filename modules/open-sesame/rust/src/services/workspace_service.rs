use crate::db::workspace_repo;
use crate::error::{AppError, AppResult};
use crate::models::workspace::{CreateWorkspaceInput, UpdateWorkspaceInput, Workspace};
use rusqlite::Connection;

pub fn create(db: &Connection, input: CreateWorkspaceInput) -> AppResult<Workspace> {
    let name = input.name.trim().to_string();

    // Validation
    if name.is_empty() {
        return Err(AppError::Validation(
            "Workspace name cannot be empty".into(),
        ));
    }
    if name.len() > 100 {
        return Err(AppError::Validation(
            "Workspace name too long (max 100 chars)".into(),
        ));
    }

    // Check duplicate
    if workspace_repo::find_by_name(db, &name)?.is_some() {
        return Err(AppError::Validation(format!(
            "Workspace '{}' already exists",
            name
        )));
    }

    let workspace = Workspace::new(name, input.icon);
    workspace_repo::insert(db, &workspace)?;
    Ok(workspace)
}

pub fn update(db: &Connection, id: &str, input: UpdateWorkspaceInput) -> AppResult<Workspace> {
    let mut ws = workspace_repo::find_by_id(db, id)?
        .ok_or_else(|| AppError::NotFound(format!("Workspace {}", id)))?;

    if let Some(name) = input.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation(
                "Workspace name cannot be empty".into(),
            ));
        }
        // Check duplicate (excluding self)
        if let Some(existing) = workspace_repo::find_by_name(db, &name)? {
            if existing.id != ws.id {
                return Err(AppError::Validation(format!(
                    "Workspace '{}' already exists",
                    name
                )));
            }
        }
        ws.name = name;
    }

    if let Some(icon) = input.icon {
        ws.icon = Some(icon);
    }

    if let Some(sort_order) = input.sort_order {
        ws.sort_order = sort_order;
    }

    ws.updated_at = chrono::Utc::now();
    workspace_repo::update(db, &ws)?;
    Ok(ws)
}

pub fn delete(db: &Connection, id: &str) -> AppResult<()> {
    // Verify exists
    workspace_repo::find_by_id(db, id)?
        .ok_or_else(|| AppError::NotFound(format!("Workspace {}", id)))?;

    // CASCADE sẽ tự xoá doc_sets
    workspace_repo::delete(db, id)?;
    Ok(())
}

pub fn list_all(db: &Connection) -> AppResult<Vec<Workspace>> {
    workspace_repo::list_all(db)
}

pub fn get_by_id(db: &Connection, id: &str) -> AppResult<Workspace> {
    workspace_repo::find_by_id(db, id)?
        .ok_or_else(|| AppError::NotFound(format!("Workspace {}", id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_workspace() {
        let db = setup_db();
        let ws = create(
            &db,
            CreateWorkspaceInput {
                name: "My Workspace".into(),
                icon: Some("📁".into()),
            },
        )
        .unwrap();

        assert_eq!(ws.name, "My Workspace");
        assert_eq!(ws.icon, Some("📁".into()));
    }

    #[test]
    fn test_create_trims_whitespace() {
        let db = setup_db();
        let ws = create(
            &db,
            CreateWorkspaceInput {
                name: "  Spaced  ".into(),
                icon: None,
            },
        )
        .unwrap();
        assert_eq!(ws.name, "Spaced");
    }

    #[test]
    fn test_create_rejects_empty_name() {
        let db = setup_db();
        let result = create(
            &db,
            CreateWorkspaceInput {
                name: "   ".into(),
                icon: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn test_create_rejects_duplicate_name() {
        let db = setup_db();
        create(
            &db,
            CreateWorkspaceInput {
                name: "Work".into(),
                icon: None,
            },
        )
        .unwrap();
        let result = create(
            &db,
            CreateWorkspaceInput {
                name: "Work".into(),
                icon: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[test]
    fn test_update_name() {
        let db = setup_db();
        let ws = create(
            &db,
            CreateWorkspaceInput {
                name: "Old".into(),
                icon: None,
            },
        )
        .unwrap();
        let updated = update(
            &db,
            &ws.id,
            UpdateWorkspaceInput {
                name: Some("New".into()),
                icon: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "New");
    }

    #[test]
    fn test_delete_nonexistent_returns_not_found() {
        let db = setup_db();
        let result = delete(&db, "nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Not found"));
    }

    #[test]
    fn test_list_empty() {
        let db = setup_db();
        let list = list_all(&db).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_update_rejects_duplicate_name() {
        let db = setup_db();
        create(
            &db,
            CreateWorkspaceInput {
                name: "A".into(),
                icon: None,
            },
        )
        .unwrap();
        let ws_b = create(
            &db,
            CreateWorkspaceInput {
                name: "B".into(),
                icon: None,
            },
        )
        .unwrap();

        let result = update(
            &db,
            &ws_b.id,
            UpdateWorkspaceInput {
                name: Some("A".into()),
                icon: None,
                sort_order: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[test]
    fn test_update_same_name_allowed() {
        let db = setup_db();
        let ws = create(
            &db,
            CreateWorkspaceInput {
                name: "Same".into(),
                icon: None,
            },
        )
        .unwrap();
        // Update with same name (only changing icon) → should be OK
        let result = update(
            &db,
            &ws.id,
            UpdateWorkspaceInput {
                name: Some("Same".into()),
                icon: Some("🔥".into()),
                sort_order: None,
            },
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap().icon, Some("🔥".into()));
    }
}
