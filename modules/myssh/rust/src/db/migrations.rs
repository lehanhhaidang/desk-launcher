use crate::error::AppResult;
use rusqlite::Connection;

/// Create the v1 schema. All statements are idempotent (`IF NOT EXISTS`).
pub fn run(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS groups (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hosts (
            id           TEXT PRIMARY KEY,
            label        TEXT NOT NULL,
            hostname     TEXT NOT NULL,
            port         INTEGER NOT NULL DEFAULT 22,
            username     TEXT NOT NULL,
            group_id     TEXT REFERENCES groups(id) ON DELETE SET NULL,
            auth_method  TEXT NOT NULL DEFAULT 'password',
            key_path     TEXT,
            secret_ref   TEXT,
            tags         TEXT NOT NULL DEFAULT '[]',
            last_used    INTEGER,
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snippets (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            command     TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS port_forwards (
            id          TEXT PRIMARY KEY,
            host_id     TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
            kind        TEXT NOT NULL,
            bind_addr   TEXT NOT NULL DEFAULT '127.0.0.1',
            bind_port   INTEGER NOT NULL,
            dest_host   TEXT NOT NULL,
            dest_port   INTEGER NOT NULL,
            label       TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS known_hosts (
            host        TEXT NOT NULL,
            port        INTEGER NOT NULL,
            key_type    TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            PRIMARY KEY (host, port)
        );
        "#,
    )?;

    // v2: auto-start flag on forwards. ALTER fails if the column already exists,
    // which is the idempotent signal that this migration already ran.
    let _ = conn.execute_batch(
        "ALTER TABLE port_forwards ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0;",
    );

    // v3: optional ProxyJump host on hosts.
    let _ = conn.execute_batch("ALTER TABLE hosts ADD COLUMN jump_host_id TEXT;");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_tables() {
        let conn = Connection::open_in_memory().unwrap();
        run(&conn).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('groups','hosts','snippets','port_forwards','known_hosts')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 5);
    }
}
