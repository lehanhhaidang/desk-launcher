use crate::error::{AppError, AppResult};
use crate::models::forward::{Forward, ForwardInput};
use crate::utils::now_unix;
use rusqlite::{params, Connection, Row};

fn row_to_forward(row: &Row) -> rusqlite::Result<Forward> {
    Ok(Forward {
        id: row.get("id")?,
        host_id: row.get("host_id")?,
        kind: row.get("kind")?,
        bind_addr: row.get("bind_addr")?,
        bind_port: row.get::<_, i64>("bind_port")? as u16,
        dest_host: row.get("dest_host")?,
        dest_port: row.get::<_, i64>("dest_port")? as u16,
        label: row.get("label")?,
        auto_start: row.get("auto_start")?,
        created_at: row.get("created_at")?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Forward>> {
    let mut stmt = conn.prepare("SELECT * FROM port_forwards ORDER BY bind_port ASC")?;
    let rows = stmt.query_map([], row_to_forward)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Forward> {
    conn.query_row("SELECT * FROM port_forwards WHERE id = ?1", params![id], row_to_forward)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("forward {id}")),
            other => AppError::Database(other),
        })
}

pub fn create(conn: &Connection, input: ForwardInput) -> AppResult<Forward> {
    if input.host_id.trim().is_empty() {
        return Err(AppError::Validation("a host is required".into()));
    }
    if input.bind_port == 0 {
        return Err(AppError::Validation("the bind/local port must be non-zero".into()));
    }
    // Dynamic (SOCKS) forwards pick their destination per-connection.
    if input.kind != "dynamic" {
        if input.dest_host.trim().is_empty() {
            return Err(AppError::Validation("destination host is required".into()));
        }
        if input.dest_port == 0 {
            return Err(AppError::Validation("destination port must be non-zero".into()));
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let bind_addr = if input.bind_addr.trim().is_empty() {
        "127.0.0.1".to_string()
    } else {
        input.bind_addr.trim().to_string()
    };
    conn.execute(
        "INSERT INTO port_forwards
            (id, host_id, kind, bind_addr, bind_port, dest_host, dest_port, label, auto_start, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            input.host_id,
            input.kind,
            bind_addr,
            input.bind_port as i64,
            input.dest_host.trim(),
            input.dest_port as i64,
            input.label,
            input.auto_start,
            now_unix(),
        ],
    )?;
    get(conn, &id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM port_forwards WHERE id = ?1", params![id])?;
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

    fn host(conn: &Connection) -> String {
        crate::db::host_repo::create(
            conn,
            crate::models::host::HostInput {
                label: "h".into(),
                hostname: "h.com".into(),
                port: 22,
                username: "root".into(),
                group_id: None,
                auth_method: "password".into(),
                key_path: None,
                secret: None,
                tags: vec![],
            },
        )
        .unwrap()
        .id
    }

    fn input(host_id: String) -> ForwardInput {
        ForwardInput {
            host_id,
            kind: "local".into(),
            bind_addr: "127.0.0.1".into(),
            bind_port: 5433,
            dest_host: "127.0.0.1".into(),
            dest_port: 5432,
            label: "db".into(),
            auto_start: false,
        }
    }

    #[test]
    fn create_list_delete() {
        let conn = mem();
        let hid = host(&conn);
        let f = create(&conn, input(hid)).unwrap();
        assert_eq!(f.bind_port, 5433);
        assert_eq!(f.dest_port, 5432);
        assert_eq!(list(&conn).unwrap().len(), 1);
        delete(&conn, &f.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn zero_port_rejected() {
        let conn = mem();
        let hid = host(&conn);
        let mut inp = input(hid);
        inp.bind_port = 0;
        assert_eq!(create(&conn, inp).err().unwrap().error_kind(), "validation");
    }

    #[test]
    fn forward_cascade_deletes_with_host() {
        let conn = mem();
        let hid = host(&conn);
        let f = create(&conn, input(hid.clone())).unwrap();
        crate::db::host_repo::delete(&conn, &hid).unwrap();
        assert!(get(&conn, &f.id).is_err());
    }
}
