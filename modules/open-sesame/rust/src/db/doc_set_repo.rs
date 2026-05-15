use crate::error::AppResult;
use crate::models::account::ProviderType;
use crate::models::doc_set::{DocSet, DocSetStatus, Strategy};
use rusqlite::{params, Connection, OptionalExtension, Row};

fn row_to_doc_set(row: &Row) -> rusqlite::Result<DocSet> {
    let strategy_str: String = row.get("strategy")?;
    let strategy: Strategy =
        serde_json::from_str(&format!("\"{}\"", strategy_str)).unwrap_or(Strategy::Standalone);

    let status_str: String = row.get("status")?;
    let status: DocSetStatus =
        serde_json::from_str(&format!("\"{}\"", status_str)).unwrap_or(DocSetStatus::Idle);

    let provider_str: String = row.get("provider_type")?;
    let provider_type = ProviderType::from_str(&provider_str).unwrap_or(ProviderType::Github);

    Ok(DocSet {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        account_id: row.get("account_id")?,
        display_name: row.get("display_name")?,
        source_path: row.get("source_path")?,
        strategy,
        mirror_path: row.get("mirror_path")?,
        provider_type,
        remote_url: row.get("remote_url")?,
        remote_id: row.get("remote_id")?,
        branch: row.get("branch")?,
        auto_sync: row.get::<_, i32>("auto_sync")? != 0,
        last_synced_at: row.get("last_synced_at")?,
        last_commit: row.get("last_commit")?,
        status,
        has_mapping: row.get::<_, i32>("has_mapping").unwrap_or(0) != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn insert(conn: &Connection, ds: &DocSet) -> AppResult<()> {
    conn.execute(
        "INSERT INTO doc_sets (id, workspace_id, account_id, display_name, source_path,
         strategy, mirror_path, provider_type, remote_url, remote_id, branch,
         auto_sync, last_synced_at, last_commit, status, has_mapping, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            ds.id,
            ds.workspace_id,
            ds.account_id,
            ds.display_name,
            ds.source_path,
            serde_json::to_string(&ds.strategy)
                .unwrap()
                .trim_matches('"'),
            ds.mirror_path,
            ds.provider_type.as_str(),
            ds.remote_url,
            ds.remote_id,
            ds.branch,
            ds.auto_sync as i32,
            ds.last_synced_at,
            ds.last_commit,
            serde_json::to_string(&ds.status).unwrap().trim_matches('"'),
            ds.has_mapping as i32,
            ds.sort_order,
            ds.created_at,
            ds.updated_at,
        ],
    )?;
    Ok(())
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<DocSet>> {
    let mut stmt = conn.prepare("SELECT * FROM doc_sets WHERE id = ?1")?;
    let result = stmt.query_row(params![id], row_to_doc_set).optional()?;
    Ok(result)
}

pub fn list_by_workspace(conn: &Connection, workspace_id: &str) -> AppResult<Vec<DocSet>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM doc_sets WHERE workspace_id = ?1 ORDER BY sort_order, display_name",
    )?;
    let rows = stmt.query_map(params![workspace_id], row_to_doc_set)?;
    let doc_sets: Vec<DocSet> = rows.filter_map(|r| r.ok()).collect();
    Ok(doc_sets)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<DocSet>> {
    let mut stmt = conn.prepare("SELECT * FROM doc_sets ORDER BY sort_order, display_name")?;
    let rows = stmt.query_map([], row_to_doc_set)?;
    let doc_sets: Vec<DocSet> = rows.filter_map(|r| r.ok()).collect();
    Ok(doc_sets)
}

pub fn update(conn: &Connection, ds: &DocSet) -> AppResult<()> {
    conn.execute(
        "UPDATE doc_sets SET display_name = ?1, source_path = ?2, mirror_path = ?3,
         remote_url = ?4, remote_id = ?5, branch = ?6, auto_sync = ?7,
         sort_order = ?8, updated_at = ?9 WHERE id = ?10",
        params![
            ds.display_name,
            ds.source_path,
            ds.mirror_path,
            ds.remote_url,
            ds.remote_id,
            ds.branch,
            ds.auto_sync as i32,
            ds.sort_order,
            ds.updated_at,
            ds.id,
        ],
    )?;
    Ok(())
}

pub fn update_status(conn: &Connection, id: &str, status: &DocSetStatus) -> AppResult<()> {
    let status_str = serde_json::to_string(status)
        .unwrap()
        .trim_matches('"')
        .to_string();
    conn.execute(
        "UPDATE doc_sets SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status_str, chrono::Utc::now(), id],
    )?;
    Ok(())
}

pub fn update_sync_state(
    conn: &Connection,
    id: &str,
    commit: &str,
    synced_at: chrono::DateTime<chrono::Utc>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE doc_sets SET last_commit = ?1, last_synced_at = ?2, status = 'idle', updated_at = ?3 WHERE id = ?4",
        params![commit, synced_at, chrono::Utc::now(), id],
    )?;
    Ok(())
}

pub fn update_remote(
    conn: &Connection,
    id: &str,
    remote_url: &str,
    branch: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE doc_sets SET remote_url = ?1, branch = ?2, status = 'idle', updated_at = ?3 WHERE id = ?4",
        params![remote_url, branch, chrono::Utc::now(), id],
    )?;
    Ok(())
}

pub fn update_auto_sync(conn: &Connection, id: &str, enabled: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE doc_sets SET auto_sync = ?1, updated_at = ?2 WHERE id = ?3",
        params![enabled as i32, chrono::Utc::now(), id],
    )?;
    Ok(())
}

pub fn update_has_mapping(conn: &Connection, id: &str, has_mapping: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE doc_sets SET has_mapping = ?1, updated_at = ?2 WHERE id = ?3",
        params![has_mapping as i32, chrono::Utc::now(), id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM doc_sets WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::models::doc_set::Strategy;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Insert required workspace + account for FK
        conn.execute(
            "INSERT INTO workspaces (id, name, sort_order, created_at, updated_at)
             VALUES ('ws1', 'Test WS', 0, '2025-01-01', '2025-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO accounts (id, provider, username, token, is_default, created_at, updated_at)
             VALUES ('acc1', 'github', 'user', 'tok', 1, '2025-01-01', '2025-01-01')",
            [],
        ).unwrap();

        conn
    }

    fn make_doc_set(id: &str, name: &str) -> DocSet {
        let now = chrono::Utc::now();
        DocSet {
            id: id.into(),
            workspace_id: "ws1".into(),
            account_id: "acc1".into(),
            display_name: name.into(),
            source_path: "/tmp/docs".into(),
            strategy: Strategy::Standalone,
            mirror_path: None,
            provider_type: ProviderType::Github,
            remote_url: None,
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
        }
    }

    #[test]
    fn test_insert_and_find() {
        let conn = setup_db();
        let ds = make_doc_set("ds1", "My Docs");
        insert(&conn, &ds).unwrap();

        let found = find_by_id(&conn, "ds1").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().display_name, "My Docs");
    }

    #[test]
    fn test_list_by_workspace() {
        let conn = setup_db();
        insert(&conn, &make_doc_set("ds1", "Docs A")).unwrap();
        insert(&conn, &make_doc_set("ds2", "Docs B")).unwrap();

        let list = list_by_workspace(&conn, "ws1").unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_update_status() {
        let conn = setup_db();
        insert(&conn, &make_doc_set("ds1", "Docs")).unwrap();

        update_status(&conn, "ds1", &DocSetStatus::Syncing).unwrap();

        let found = find_by_id(&conn, "ds1").unwrap().unwrap();
        assert_eq!(found.status, DocSetStatus::Syncing);
    }

    #[test]
    fn test_delete() {
        let conn = setup_db();
        insert(&conn, &make_doc_set("ds1", "Docs")).unwrap();
        delete(&conn, "ds1").unwrap();

        let found = find_by_id(&conn, "ds1").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_fk_rejects_invalid_workspace() {
        let conn = setup_db();
        let mut ds = make_doc_set("ds1", "Docs");
        ds.workspace_id = "INVALID".into();
        let result = insert(&conn, &ds);
        assert!(result.is_err());
    }
}
