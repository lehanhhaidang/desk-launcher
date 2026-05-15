use crate::error::AppResult;
use crate::models::sync_log::{SyncLog, SyncLogStatus};
use rusqlite::{params, Connection, Row};

fn row_to_sync_log(row: &Row) -> rusqlite::Result<SyncLog> {
    let status_str: String = row.get("status")?;
    let status: SyncLogStatus =
        serde_json::from_str(&format!("\"{}\"", status_str)).unwrap_or(SyncLogStatus::Error);

    Ok(SyncLog {
        id: row.get("id")?,
        doc_set_id: row.get("doc_set_id")?,
        direction: row.get("direction")?,
        commit_hash: row.get("commit_hash")?,
        message: row.get("message")?,
        files_count: row.get("files_count")?,
        status,
        error_msg: row.get("error_msg")?,
        created_at: row.get("created_at")?,
    })
}

pub fn insert(conn: &Connection, log: &SyncLog) -> AppResult<()> {
    let status_str = serde_json::to_string(&log.status)
        .unwrap()
        .trim_matches('"')
        .to_string();
    conn.execute(
        "INSERT INTO sync_logs (id, doc_set_id, direction, commit_hash, message,
         files_count, status, error_msg, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            log.id,
            log.doc_set_id,
            log.direction,
            log.commit_hash,
            log.message,
            log.files_count,
            status_str,
            log.error_msg,
            log.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_by_doc_set(conn: &Connection, doc_set_id: &str) -> AppResult<Vec<SyncLog>> {
    let mut stmt =
        conn.prepare("SELECT * FROM sync_logs WHERE doc_set_id = ?1 ORDER BY created_at DESC")?;
    let rows = stmt.query_map(params![doc_set_id], row_to_sync_log)?;
    let logs: Vec<SyncLog> = rows.filter_map(|r| r.ok()).collect();
    Ok(logs)
}

pub fn list_recent(conn: &Connection, doc_set_id: &str, limit: i64) -> AppResult<Vec<SyncLog>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM sync_logs WHERE doc_set_id = ?1 ORDER BY created_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![doc_set_id, limit], row_to_sync_log)?;
    let logs: Vec<SyncLog> = rows.filter_map(|r| r.ok()).collect();
    Ok(logs)
}

pub fn delete_by_doc_set(conn: &Connection, doc_set_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM sync_logs WHERE doc_set_id = ?1",
        params![doc_set_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::models::sync_log::SyncLogStatus;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO workspaces (id, name, sort_order, created_at, updated_at)
             VALUES ('ws1', 'WS', 0, '2025-01-01', '2025-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO accounts (id, provider, username, token, is_default, created_at, updated_at)
             VALUES ('acc1', 'github', 'user', 'tok', 1, '2025-01-01', '2025-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO doc_sets (id, workspace_id, account_id, display_name, source_path,
             strategy, provider_type, branch, auto_sync, status, sort_order, created_at, updated_at)
             VALUES ('ds1', 'ws1', 'acc1', 'Docs', '/tmp', 'standalone', 'github',
             'main', 0, 'idle', 0, '2025-01-01', '2025-01-01')",
            [],
        )
        .unwrap();

        conn
    }

    fn make_log(id: &str, status: SyncLogStatus) -> SyncLog {
        let mut log = SyncLog::new(
            "ds1".into(),
            "up".into(),
            Some("abc123".into()),
            Some("sync".into()),
            3,
            status,
            None,
        );
        log.id = id.into();
        log
    }

    #[test]
    fn test_insert_and_list() {
        let conn = setup_db();
        let mut log1 = make_log("log1", SyncLogStatus::Success);
        log1.id = "log1".into();
        let mut log2 = make_log("log2", SyncLogStatus::Error);
        log2.id = "log2".into();
        insert(&conn, &log1).unwrap();
        insert(&conn, &log2).unwrap();

        let logs = list_by_doc_set(&conn, "ds1").unwrap();
        assert_eq!(logs.len(), 2);
    }

    #[test]
    fn test_list_recent_with_limit() {
        let conn = setup_db();
        for i in 0..5 {
            let mut log = make_log(&format!("log{}", i), SyncLogStatus::Success);
            log.id = format!("log{}", i);
            insert(&conn, &log).unwrap();
        }

        let logs = list_recent(&conn, "ds1", 3).unwrap();
        assert_eq!(logs.len(), 3);
    }

    #[test]
    fn test_delete_by_doc_set() {
        let conn = setup_db();
        let mut log = make_log("log1", SyncLogStatus::Success);
        log.id = "log1".into();
        insert(&conn, &log).unwrap();
        delete_by_doc_set(&conn, "ds1").unwrap();

        let logs = list_by_doc_set(&conn, "ds1").unwrap();
        assert!(logs.is_empty());
    }
}
