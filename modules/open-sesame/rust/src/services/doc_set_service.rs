use crate::db::{account_repo, doc_set_repo, workspace_repo};
use crate::error::{AppError, AppResult};
use crate::models::doc_set::{CreateDocSetInput, DocSet, DocSetStatus, Strategy};
use crate::services::{doc_set_manifest_service, mirror_service};
use crate::utils::paths;
use rusqlite::Connection;
use std::path::Path;

/// Create doc set — validate, setup mirror, save to DB.
/// Remote repo creation + git init are deferred to a separate sync command
/// to keep creation fast and non-blocking.
pub fn create(db: &Connection, input: CreateDocSetInput) -> AppResult<DocSet> {
    // 1. Validate
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(AppError::Validation("Display name cannot be empty".into()));
    }

    // Verify workspace exists
    workspace_repo::find_by_id(db, &input.workspace_id)?
        .ok_or_else(|| AppError::NotFound("Workspace".into()))?;

    // Verify account exists
    account_repo::find_by_id(db, &input.account_id)?
        .ok_or_else(|| AppError::NotFound("Account".into()))?;

    // 2. Validate source
    let source = Path::new(&input.source_path);
    if !source.exists() {
        return Err(AppError::Validation(format!(
            "Path does not exist: {}",
            source.display()
        )));
    }
    if !source.is_dir() {
        return Err(AppError::Validation("Path must be a directory".into()));
    }

    // 3. Always setup mirror path. Phase 6 makes mirror the only product path.
    let id = uuid::Uuid::new_v4().to_string();
    let mirror_path = paths::mirror_path(&id)?;
    mirror_service::copy_to_staging(source, &mirror_path)?;

    // 4. Save to DB
    let now = chrono::Utc::now();
    let doc_set = DocSet {
        id,
        workspace_id: input.workspace_id,
        account_id: input.account_id,
        display_name,
        source_path: input.source_path,
        strategy: Strategy::Mirrored,
        mirror_path: Some(mirror_path.to_string_lossy().to_string()),
        provider_type: input.provider_type,
        remote_url: input.remote_url,
        remote_id: None,
        branch: "main".into(),
        auto_sync: false,
        last_synced_at: None,
        last_commit: None,
        status: DocSetStatus::Idle,
        has_mapping: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    doc_set_manifest_service::write_manifest(&doc_set)?;
    doc_set_repo::insert(db, &doc_set)?;
    Ok(doc_set)
}

pub fn list_by_workspace(db: &Connection, workspace_id: &str) -> AppResult<Vec<DocSet>> {
    doc_set_repo::list_by_workspace(db, workspace_id)
}

pub fn get_by_id(db: &Connection, id: &str) -> AppResult<DocSet> {
    doc_set_repo::find_by_id(db, id)?.ok_or_else(|| AppError::NotFound("Doc set".into()))
}

pub fn delete(db: &Connection, id: &str) -> AppResult<()> {
    let doc_set =
        doc_set_repo::find_by_id(db, id)?.ok_or_else(|| AppError::NotFound("Doc set".into()))?;

    // Cleanup mirror folder if exists
    if let Some(mp) = &doc_set.mirror_path {
        let _ = std::fs::remove_dir_all(mp); // Best effort
    }

    doc_set_repo::delete(db, id)?;
    Ok(())
}

pub fn move_to_workspace(db: &Connection, id: &str, workspace_id: &str) -> AppResult<DocSet> {
    // Verify doc set exists
    doc_set_repo::find_by_id(db, id)?.ok_or_else(|| AppError::NotFound("Doc set".into()))?;

    // Verify target workspace exists
    workspace_repo::find_by_id(db, workspace_id)?
        .ok_or_else(|| AppError::NotFound("Workspace".into()))?;

    db.execute(
        "UPDATE doc_sets SET workspace_id = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![workspace_id, chrono::Utc::now().to_rfc3339(), id],
    )?;

    doc_set_repo::find_by_id(db, id)?.ok_or_else(|| AppError::NotFound("Doc set".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::models::account::ProviderType;
    use tempfile::TempDir;

    fn setup_db_with_fixtures() -> (Connection, TempDir) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO workspaces (id, name, sort_order, created_at, updated_at)
             VALUES ('ws1', 'WS', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO accounts (id, provider, username, token, is_default, created_at, updated_at)
             VALUES ('acc1', 'github', 'user', 'tok', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')",
            [],
        ).unwrap();

        let tmp = TempDir::new().unwrap();
        (conn, tmp)
    }

    #[test]
    fn test_create_validates_empty_name() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();

        let result = create(
            &db,
            CreateDocSetInput {
                workspace_id: "ws1".into(),
                account_id: "acc1".into(),
                display_name: "   ".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn test_create_checks_workspace_exists() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();

        let result = create(
            &db,
            CreateDocSetInput {
                workspace_id: "INVALID".into(),
                account_id: "acc1".into(),
                display_name: "Docs".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Not found"));
    }

    #[test]
    fn test_create_checks_account_exists() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();

        let result = create(
            &db,
            CreateDocSetInput {
                workspace_id: "ws1".into(),
                account_id: "INVALID".into(),
                display_name: "Docs".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_doc_set_always_uses_mirror() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("readme.md"), "# Hello").unwrap();

        let ds = create(
            &db,
            CreateDocSetInput {
                workspace_id: "ws1".into(),
                account_id: "acc1".into(),
                display_name: "My Docs".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        )
        .unwrap();

        assert_eq!(ds.display_name, "My Docs");
        assert_eq!(ds.strategy, Strategy::Mirrored);
        let mirror_path = ds.mirror_path.expect("mirror path should be set");
        assert!(Path::new(&mirror_path).join("readme.md").exists());
        assert!(!source.join(".git").exists());
    }

    #[test]
    fn test_list_by_workspace() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();

        create(
            &db,
            CreateDocSetInput {
                workspace_id: "ws1".into(),
                account_id: "acc1".into(),
                display_name: "Docs A".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        )
        .unwrap();

        let list = list_by_workspace(&db, "ws1").unwrap();
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn test_delete_doc_set() {
        let (db, tmp) = setup_db_with_fixtures();
        let source = tmp.path().join("docs");
        std::fs::create_dir(&source).unwrap();

        let ds = create(
            &db,
            CreateDocSetInput {
                workspace_id: "ws1".into(),
                account_id: "acc1".into(),
                display_name: "To Delete".into(),
                source_path: source.to_string_lossy().into(),
                provider_type: ProviderType::Github,
                remote_url: None,
            },
        )
        .unwrap();

        delete(&db, &ds.id).unwrap();
        let list = list_by_workspace(&db, "ws1").unwrap();
        assert!(list.is_empty());
    }
}
