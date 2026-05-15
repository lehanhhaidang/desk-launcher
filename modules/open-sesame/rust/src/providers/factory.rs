use crate::db::account_repo;
use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use crate::providers::git_provider::GitProvider;
use crate::providers::SyncProvider;
use crate::utils::secret_store;
use rusqlite::Connection;

/// Build provider cho doc set, load token từ DB
pub fn create_provider(db: &Connection, doc_set: &DocSet) -> AppResult<Box<dyn SyncProvider>> {
    let account = account_repo::find_by_id(db, &doc_set.account_id)?
        .ok_or_else(|| AppError::NotFound(format!("Account {}", doc_set.account_id)))?;

    let remote_url = doc_set
        .remote_url
        .clone()
        .ok_or_else(|| AppError::Internal("Doc set has no remote URL".into()))?;
    let token = secret_store::resolve_token(&account.token)?;

    match doc_set.provider_type {
        crate::models::account::ProviderType::Github
        | crate::models::account::ProviderType::Gitlab => Ok(Box::new(GitProvider::new(
            token,
            account.username.clone(),
            remote_url,
            doc_set.branch.clone(),
        ))),
        crate::models::account::ProviderType::GoogleDrive => Err(AppError::Provider(
            "Google Drive provider not yet implemented".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::models::account::ProviderType;
    use crate::models::doc_set::{DocSet, DocSetStatus, Strategy};

    fn setup_db() -> Connection {
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
             VALUES ('acc1', 'github', 'testuser', 'tok123', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn
    }

    fn make_ds(account_id: &str, provider: ProviderType) -> DocSet {
        let now = chrono::Utc::now();
        DocSet {
            id: "ds1".into(),
            workspace_id: "ws1".into(),
            account_id: account_id.into(),
            display_name: "Test".into(),
            source_path: "/tmp".into(),
            strategy: Strategy::Standalone,
            mirror_path: None,
            provider_type: provider,
            remote_url: Some("https://github.com/u/r.git".into()),
            remote_id: None,
            branch: "main".into(),
            auto_sync: false,
            last_synced_at: None,
            last_commit: None,
            status: DocSetStatus::Idle,
            sort_order: 0,
            has_mapping: false,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn test_create_provider_github() {
        let db = setup_db();
        let ds = make_ds("acc1", ProviderType::Github);
        let provider = create_provider(&db, &ds);
        assert!(provider.is_ok());
        assert_eq!(provider.unwrap().provider_name(), "GitHub");
    }

    #[test]
    fn test_create_provider_missing_account() {
        let db = setup_db();
        let ds = make_ds("nonexistent", ProviderType::Github);
        let result = create_provider(&db, &ds);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_provider_google_drive_not_implemented() {
        let db = setup_db();
        let ds = make_ds("acc1", ProviderType::GoogleDrive);
        let result = create_provider(&db, &ds);
        assert!(result.is_err());
        let err = result.err().unwrap();
        assert!(err.to_string().contains("not yet implemented"));
    }
}
