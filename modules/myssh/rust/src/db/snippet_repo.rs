use crate::error::{AppError, AppResult};
use crate::models::snippet::{Snippet, SnippetInput};
use crate::utils::now_unix;
use rusqlite::{params, Connection, Row};

fn row_to_snippet(row: &Row) -> rusqlite::Result<Snippet> {
    Ok(Snippet {
        id: row.get("id")?,
        name: row.get("name")?,
        command: row.get("command")?,
        created_at: row.get("created_at")?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Snippet>> {
    let mut stmt = conn.prepare("SELECT * FROM snippets ORDER BY name ASC")?;
    let rows = stmt.query_map([], row_to_snippet)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Snippet> {
    conn.query_row("SELECT * FROM snippets WHERE id = ?1", params![id], row_to_snippet)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("snippet {id}")),
            other => AppError::Database(other),
        })
}

fn validate(input: &SnippetInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("snippet name is required".into()));
    }
    if input.command.trim().is_empty() {
        return Err(AppError::Validation("snippet command is required".into()));
    }
    Ok(())
}

pub fn create(conn: &Connection, input: SnippetInput) -> AppResult<Snippet> {
    validate(&input)?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO snippets (id, name, command, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, input.name.trim(), input.command, now_unix()],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: SnippetInput) -> AppResult<Snippet> {
    validate(&input)?;
    get(conn, id)?;
    conn.execute(
        "UPDATE snippets SET name = ?2, command = ?3 WHERE id = ?1",
        params![id, input.name.trim(), input.command],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
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
    fn create_update_list_delete() {
        let conn = mem();
        let s = create(
            &conn,
            SnippetInput { name: "tail log".into(), command: "tail -f /var/log/syslog".into() },
        )
        .unwrap();
        assert_eq!(s.name, "tail log");
        let updated = update(
            &conn,
            &s.id,
            SnippetInput { name: "tail log".into(), command: "tail -n 100 /var/log/syslog".into() },
        )
        .unwrap();
        assert_eq!(updated.command, "tail -n 100 /var/log/syslog");
        assert_eq!(list(&conn).unwrap().len(), 1);
        delete(&conn, &s.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn blank_command_rejected() {
        let conn = mem();
        let err = create(&conn, SnippetInput { name: "x".into(), command: "  ".into() })
            .err()
            .unwrap();
        assert_eq!(err.error_kind(), "validation");
    }
}
