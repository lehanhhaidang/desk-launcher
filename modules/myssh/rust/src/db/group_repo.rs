use crate::error::{AppError, AppResult};
use crate::models::group::{Group, GroupInput};
use crate::utils::now_unix;
use rusqlite::{params, Connection, Row};

fn row_to_group(row: &Row) -> rusqlite::Result<Group> {
    Ok(Group {
        id: row.get("id")?,
        name: row.get("name")?,
        created_at: row.get("created_at")?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Group>> {
    let mut stmt = conn.prepare("SELECT * FROM groups ORDER BY name ASC")?;
    let rows = stmt.query_map([], row_to_group)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Group> {
    conn.query_row("SELECT * FROM groups WHERE id = ?1", params![id], row_to_group)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("group {id}")),
            other => AppError::Database(other),
        })
}

pub fn create(conn: &Connection, input: GroupInput) -> AppResult<Group> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("group name is required".into()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO groups (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, input.name.trim(), now_unix()],
    )?;
    get(conn, &id)
}

/// Delete a group. Hosts referencing it have their `group_id` set NULL via the
/// foreign-key `ON DELETE SET NULL`.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
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

    #[test]
    fn create_list_delete() {
        let conn = mem();
        let group = create(&conn, GroupInput { name: "Production".into() }).unwrap();
        assert_eq!(group.name, "Production");
        assert_eq!(list(&conn).unwrap().len(), 1);
        delete(&conn, &group.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn deleting_group_nulls_host_group_id() {
        let conn = mem();
        let group = create(&conn, GroupInput { name: "G".into() }).unwrap();
        let host = crate::db::host_repo::create(
            &conn,
            crate::models::host::HostInput {
                label: "h".into(),
                hostname: "h.com".into(),
                port: 22,
                username: "root".into(),
                group_id: Some(group.id.clone()),
                auth_method: "password".into(),
                key_path: None,
                secret: None,
                tags: vec![],
            },
        )
        .unwrap();
        delete(&conn, &group.id).unwrap();
        let reloaded = crate::db::host_repo::get(&conn, &host.id).unwrap();
        assert_eq!(reloaded.group_id, None);
    }

    #[test]
    fn empty_name_is_rejected() {
        let conn = mem();
        let err = create(&conn, GroupInput { name: "   ".into() }).err().unwrap();
        assert_eq!(err.error_kind(), "validation");
    }
}
