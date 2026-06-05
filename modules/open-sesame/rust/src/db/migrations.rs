use crate::error::AppResult;
use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // Migration 0001: Initial schema
    "CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
        id            TEXT PRIMARY KEY,
        provider      TEXT NOT NULL,
        username      TEXT NOT NULL,
        token         TEXT NOT NULL,
        refresh_token TEXT,
        avatar_url    TEXT,
        is_default    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        icon       TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doc_sets (
        id             TEXT PRIMARY KEY,
        workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id     TEXT NOT NULL REFERENCES accounts(id),
        display_name   TEXT NOT NULL,
        source_path    TEXT NOT NULL,
        strategy       TEXT NOT NULL,
        mirror_path    TEXT,
        provider_type  TEXT NOT NULL,
        remote_url     TEXT,
        remote_id      TEXT,
        branch         TEXT NOT NULL DEFAULT 'main',
        auto_sync      INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        last_commit    TEXT,
        status         TEXT NOT NULL DEFAULT 'idle',
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
        id          TEXT PRIMARY KEY,
        doc_set_id  TEXT NOT NULL REFERENCES doc_sets(id) ON DELETE CASCADE,
        direction   TEXT NOT NULL,
        commit_hash TEXT,
        message     TEXT,
        files_count INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL,
        error_msg   TEXT,
        created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_meta (
        id         TEXT PRIMARY KEY,
        doc_set_id TEXT NOT NULL REFERENCES doc_sets(id) ON DELETE CASCADE,
        file_path  TEXT NOT NULL,
        tags       TEXT,
        notes      TEXT,
        bookmarked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(doc_set_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS drive_file_state (
        id              TEXT PRIMARY KEY,
        doc_set_id      TEXT NOT NULL REFERENCES doc_sets(id) ON DELETE CASCADE,
        file_path       TEXT NOT NULL,
        local_hash      TEXT,
        remote_hash     TEXT,
        remote_id       TEXT,
        remote_modified TEXT,
        local_modified  TEXT,
        UNIQUE(doc_set_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_doc_sets_workspace ON doc_sets(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_doc_set ON sync_logs(doc_set_id);
    CREATE INDEX IF NOT EXISTS idx_file_meta_doc_set ON file_meta(doc_set_id);
    CREATE INDEX IF NOT EXISTS idx_file_meta_bookmarked ON file_meta(bookmarked) WHERE bookmarked = 1;
    CREATE INDEX IF NOT EXISTS idx_drive_state_doc_set ON drive_file_state(doc_set_id);",
    // Migration 0002: Add has_mapping to doc_sets
    "ALTER TABLE doc_sets ADD COLUMN has_mapping INTEGER NOT NULL DEFAULT 0;
     UPDATE doc_sets SET has_mapping = 1;",
    // Migration 0003: Backfill has_mapping for existing doc sets
    "UPDATE doc_sets SET has_mapping = 1 WHERE has_mapping = 0;",
];

pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    // Tạo migration tracking table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id      INTEGER PRIMARY KEY,
            applied TEXT NOT NULL
        );",
    )?;

    let applied_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))?;

    for (i, migration) in MIGRATIONS.iter().enumerate() {
        if i as i64 >= applied_count {
            conn.execute_batch(migration)?;
            conn.execute(
                "INSERT INTO _migrations (id, applied) VALUES (?1, ?2)",
                rusqlite::params![i as i64, chrono::Utc::now().to_rfc3339()],
            )?;
            tracing::info!("Applied migration {}", i);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn
    }

    #[test]
    fn test_migrations_run_on_fresh_db() {
        let conn = test_db();
        run_migrations(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"workspaces".to_string()));
        assert!(tables.contains(&"doc_sets".to_string()));
        assert!(tables.contains(&"accounts".to_string()));
        assert!(tables.contains(&"sync_logs".to_string()));
        assert!(tables.contains(&"file_meta".to_string()));
        assert!(tables.contains(&"drive_file_state".to_string()));
    }

    #[test]
    fn test_migrations_idempotent() {
        let conn = test_db();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap(); // Chạy lần 2 không lỗi

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 3); // 3 migrations applied, each exactly once (idempotent)
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let conn = test_db();
        run_migrations(&conn).unwrap();

        // Insert workspace
        conn.execute(
            "INSERT INTO workspaces (id, name, sort_order, created_at, updated_at)
             VALUES ('ws1', 'Test', 0, '2025-01-01', '2025-01-01')",
            [],
        )
        .unwrap();

        // Insert doc_set with invalid workspace_id should fail
        let result = conn.execute(
            "INSERT INTO doc_sets (id, workspace_id, account_id, display_name, source_path,
             strategy, provider_type, branch, auto_sync, status, sort_order, created_at, updated_at)
             VALUES ('ds1', 'INVALID', 'acc1', 'Test', '/tmp', 'standalone', 'github',
             'main', 0, 'idle', 0, '2025-01-01', '2025-01-01')",
            [],
        );
        assert!(result.is_err()); // FK constraint
    }
}
