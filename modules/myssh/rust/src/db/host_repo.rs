use crate::error::{AppError, AppResult};
use crate::models::host::{Host, HostInput};
use crate::utils::{now_unix, secret_store};
use rusqlite::{params, Connection, OptionalExtension, Row};

fn row_to_host(row: &Row) -> rusqlite::Result<Host> {
    let tags_json: String = row.get("tags")?;
    let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
    let secret_ref: Option<String> = row.get("secret_ref")?;
    Ok(Host {
        id: row.get("id")?,
        label: row.get("label")?,
        hostname: row.get("hostname")?,
        port: row.get::<_, i64>("port")? as u16,
        username: row.get("username")?,
        group_id: row.get("group_id")?,
        auth_method: row.get("auth_method")?,
        key_path: row.get("key_path")?,
        has_secret: secret_ref.is_some(),
        tags,
        last_used: row.get("last_used")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Host>> {
    let mut stmt =
        conn.prepare("SELECT * FROM hosts ORDER BY COALESCE(last_used, 0) DESC, label ASC")?;
    let rows = stmt.query_map([], row_to_host)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Host> {
    conn.query_row("SELECT * FROM hosts WHERE id = ?1", params![id], row_to_host)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("host {id}")),
            other => AppError::Database(other),
        })
}

fn raw_secret_ref(conn: &Connection, id: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT secret_ref FROM hosts WHERE id = ?1",
            params![id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
}

fn validate(input: &HostInput) -> AppResult<()> {
    if input.label.trim().is_empty() {
        return Err(AppError::Validation("label is required".into()));
    }
    if input.hostname.trim().is_empty() {
        return Err(AppError::Validation("hostname is required".into()));
    }
    if input.username.trim().is_empty() {
        return Err(AppError::Validation("username is required".into()));
    }
    Ok(())
}

pub fn create(conn: &Connection, input: HostInput) -> AppResult<Host> {
    validate(&input)?;
    let id = uuid::Uuid::new_v4().to_string();
    let secret_ref = match input.secret.as_deref() {
        Some(s) if !s.is_empty() => Some(secret_store::store_host_secret(&id, s)?),
        _ => None,
    };
    let tags_json = serde_json::to_string(&input.tags)?;
    let ts = now_unix();
    conn.execute(
        "INSERT INTO hosts
            (id, label, hostname, port, username, group_id, auth_method, key_path, secret_ref, tags, last_used, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?11)",
        params![
            id,
            input.label,
            input.hostname,
            input.port as i64,
            input.username,
            input.group_id,
            input.auth_method,
            input.key_path,
            secret_ref,
            tags_json,
            ts,
        ],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: HostInput) -> AppResult<Host> {
    // Ensure the host exists (clear NotFound vs. silent no-op).
    get(conn, id)?;
    let secret_ref = match input.secret.as_deref() {
        Some(s) if !s.is_empty() => Some(secret_store::store_host_secret(id, s)?),
        _ => raw_secret_ref(conn, id)?,
    };
    let tags_json = serde_json::to_string(&input.tags)?;
    conn.execute(
        "UPDATE hosts SET
            label = ?2, hostname = ?3, port = ?4, username = ?5, group_id = ?6,
            auth_method = ?7, key_path = ?8, secret_ref = ?9, tags = ?10, updated_at = ?11
         WHERE id = ?1",
        params![
            id,
            input.label,
            input.hostname,
            input.port as i64,
            input.username,
            input.group_id,
            input.auth_method,
            input.key_path,
            secret_ref,
            tags_json,
            now_unix(),
        ],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let secret_ref = raw_secret_ref(conn, id)?;
    conn.execute("DELETE FROM hosts WHERE id = ?1", params![id])?;
    if let Some(reference) = secret_ref {
        // Best-effort: a leftover keyring entry must not fail the delete.
        let _ = secret_store::delete_host_secret(&reference);
    }
    Ok(())
}

/// Update `last_used` to now; called when a session opens.
pub fn touch_last_used(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE hosts SET last_used = ?2 WHERE id = ?1",
        params![id, now_unix()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    fn sample(label: &str) -> HostInput {
        HostInput {
            label: label.into(),
            hostname: "example.com".into(),
            port: 22,
            username: "root".into(),
            group_id: None,
            auth_method: "password".into(),
            key_path: None,
            secret: None,
            tags: vec!["prod".into()],
        }
    }

    #[test]
    fn create_and_list() {
        let conn = mem();
        let host = create(&conn, sample("web")).unwrap();
        assert_eq!(host.label, "web");
        assert_eq!(host.port, 22);
        assert!(!host.has_secret);
        assert_eq!(host.tags, vec!["prod".to_string()]);
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn update_changes_fields() {
        let conn = mem();
        let host = create(&conn, sample("web")).unwrap();
        let mut input = sample("web-renamed");
        input.port = 2222;
        let updated = update(&conn, &host.id, input).unwrap();
        assert_eq!(updated.label, "web-renamed");
        assert_eq!(updated.port, 2222);
        assert_eq!(updated.id, host.id);
    }

    #[test]
    fn delete_removes_row() {
        let conn = mem();
        let host = create(&conn, sample("web")).unwrap();
        delete(&conn, &host.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn empty_label_is_rejected() {
        let conn = mem();
        let err = create(&conn, sample("")).err().unwrap();
        assert_eq!(err.error_kind(), "validation");
    }

    #[test]
    fn get_missing_is_not_found() {
        let conn = mem();
        let err = get(&conn, "nope").err().unwrap();
        assert_eq!(err.error_kind(), "not_found");
    }
}
