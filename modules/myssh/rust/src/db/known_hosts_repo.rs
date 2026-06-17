use crate::error::AppResult;
use crate::models::known_host::KnownHost;
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

/// All stored host-key records, ordered by host/port.
pub fn list(conn: &Connection) -> AppResult<Vec<KnownHost>> {
    let mut stmt =
        conn.prepare("SELECT host, port, key_type, fingerprint FROM known_hosts ORDER BY host, port")?;
    let rows = stmt.query_map([], |r| {
        Ok(KnownHost {
            host: r.get("host")?,
            port: r.get::<_, i64>("port")? as u16,
            key_type: r.get("key_type")?,
            fingerprint: r.get("fingerprint")?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Forget a (host, port) so the next connection re-trusts on first use.
pub fn remove(conn: &Connection, host: &str, port: u16) -> AppResult<()> {
    conn.execute(
        "DELETE FROM known_hosts WHERE host = ?1 AND port = ?2",
        params![host, port as i64],
    )?;
    Ok(())
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
