use crate::error::AppResult;
use crate::models::workspace::Workspace;
use rusqlite::{params, Connection, OptionalExtension, Row};

fn row_to_workspace(row: &Row) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get("id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn insert(conn: &Connection, ws: &Workspace) -> AppResult<()> {
    conn.execute(
        "INSERT INTO workspaces (id, name, icon, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            ws.id,
            ws.name,
            ws.icon,
            ws.sort_order,
            ws.created_at,
            ws.updated_at
        ],
    )?;
    Ok(())
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<Workspace>> {
    let mut stmt = conn.prepare("SELECT * FROM workspaces WHERE id = ?1")?;
    let result = stmt.query_row(params![id], row_to_workspace).optional()?;
    Ok(result)
}

pub fn find_by_name(conn: &Connection, name: &str) -> AppResult<Option<Workspace>> {
    let mut stmt = conn.prepare("SELECT * FROM workspaces WHERE name = ?1")?;
    let result = stmt.query_row(params![name], row_to_workspace).optional()?;
    Ok(result)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Workspace>> {
    let mut stmt = conn.prepare("SELECT * FROM workspaces ORDER BY sort_order, name")?;
    let rows = stmt.query_map([], row_to_workspace)?;
    let workspaces: Vec<Workspace> = rows.filter_map(|r| r.ok()).collect();
    Ok(workspaces)
}

pub fn update(conn: &Connection, ws: &Workspace) -> AppResult<()> {
    conn.execute(
        "UPDATE workspaces SET name = ?1, icon = ?2, sort_order = ?3, updated_at = ?4
         WHERE id = ?5",
        params![ws.name, ws.icon, ws.sort_order, ws.updated_at, ws.id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::models::workspace::Workspace;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_insert_and_find() {
        let conn = setup_db();
        let ws = Workspace::new("Test".into(), None);
        insert(&conn, &ws).unwrap();

        let found = find_by_id(&conn, &ws.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Test");
    }

    #[test]
    fn test_find_nonexistent_returns_none() {
        let conn = setup_db();
        let found = find_by_id(&conn, "nonexistent").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_list_ordered_by_sort_then_name() {
        let conn = setup_db();
        let mut ws_b = Workspace::new("B".into(), None);
        ws_b.sort_order = 1;
        let mut ws_a = Workspace::new("A".into(), None);
        ws_a.sort_order = 0;

        insert(&conn, &ws_b).unwrap();
        insert(&conn, &ws_a).unwrap();

        let list = list_all(&conn).unwrap();
        assert_eq!(list[0].name, "A"); // sort_order 0
        assert_eq!(list[1].name, "B"); // sort_order 1
    }

    #[test]
    fn test_update() {
        let conn = setup_db();
        let mut ws = Workspace::new("Old Name".into(), None);
        insert(&conn, &ws).unwrap();

        ws.name = "New Name".into();
        ws.updated_at = chrono::Utc::now();
        update(&conn, &ws).unwrap();

        let found = find_by_id(&conn, &ws.id).unwrap().unwrap();
        assert_eq!(found.name, "New Name");
    }

    #[test]
    fn test_delete() {
        let conn = setup_db();
        let ws = Workspace::new("ToDelete".into(), None);
        insert(&conn, &ws).unwrap();

        delete(&conn, &ws.id).unwrap();
        let found = find_by_id(&conn, &ws.id).unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_find_by_name() {
        let conn = setup_db();
        let ws = Workspace::new("Unique Name".into(), None);
        insert(&conn, &ws).unwrap();

        let found = find_by_name(&conn, "Unique Name").unwrap();
        assert!(found.is_some());

        let not_found = find_by_name(&conn, "Other").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_cascade_delete_workspace_removes_doc_sets() {
        let conn = setup_db();
        let ws = Workspace::new("WS".into(), None);
        insert(&conn, &ws).unwrap();

        // Insert dummy account first
        conn.execute(
            "INSERT INTO accounts (id, provider, username, token, is_default, created_at, updated_at)
             VALUES ('acc1', 'github', 'user', 'tok', 0, '2025-01-01', '2025-01-01')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO doc_sets (id, workspace_id, account_id, display_name, source_path,
             strategy, provider_type, branch, auto_sync, status, sort_order, created_at, updated_at)
             VALUES ('ds1', ?1, 'acc1', 'Docs', '/tmp', 'standalone', 'github',
             'main', 0, 'idle', 0, '2025-01-01', '2025-01-01')",
            params![ws.id],
        )
        .unwrap();

        // Delete workspace → doc_set should cascade
        delete(&conn, &ws.id).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM doc_sets WHERE workspace_id = ?1",
                params![ws.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
