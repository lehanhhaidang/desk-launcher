use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};

/// Stored fingerprint for a (host, port), or `None` if never seen.
pub fn get(conn: &Connection, host: &str, port: u16) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT fingerprint FROM known_hosts WHERE host = ?1 AND port = ?2",
            params![host, port as i64],
            |r| r.get::<_, String>(0),
        )
        .optional()?)
}

/// Record a (host, port) fingerprint on first use (trust-on-first-use).
pub fn insert(conn: &Connection, host: &str, port: u16, key_type: &str, fingerprint: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO known_hosts (host, port, key_type, fingerprint) VALUES (?1, ?2, ?3, ?4)",
        params![host, port as i64, key_type, fingerprint],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn unknown_then_known() {
        let conn = mem();
        assert_eq!(get(&conn, "h.com", 22).unwrap(), None);
        insert(&conn, "h.com", 22, "ssh-ed25519", "SHA256:abc").unwrap();
        assert_eq!(get(&conn, "h.com", 22).unwrap(), Some("SHA256:abc".to_string()));
    }
}
