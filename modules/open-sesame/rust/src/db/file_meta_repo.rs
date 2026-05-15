use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension, Row};

/// Lightweight file metadata (tags, notes, bookmarks)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileMeta {
    pub id: String,
    pub doc_set_id: String,
    pub file_path: String,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub bookmarked: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

fn row_to_file_meta(row: &Row) -> rusqlite::Result<FileMeta> {
    Ok(FileMeta {
        id: row.get("id")?,
        doc_set_id: row.get("doc_set_id")?,
        file_path: row.get("file_path")?,
        tags: row.get("tags")?,
        notes: row.get("notes")?,
        bookmarked: row.get::<_, i32>("bookmarked")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn upsert(conn: &Connection, meta: &FileMeta) -> AppResult<()> {
    conn.execute(
        "INSERT INTO file_meta (id, doc_set_id, file_path, tags, notes, bookmarked, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(doc_set_id, file_path)
         DO UPDATE SET tags = ?4, notes = ?5, bookmarked = ?6, updated_at = ?8",
        params![
            meta.id,
            meta.doc_set_id,
            meta.file_path,
            meta.tags,
            meta.notes,
            meta.bookmarked as i32,
            meta.created_at,
            meta.updated_at,
        ],
    )?;
    Ok(())
}

pub fn find_by_path(
    conn: &Connection,
    doc_set_id: &str,
    file_path: &str,
) -> AppResult<Option<FileMeta>> {
    let mut stmt =
        conn.prepare("SELECT * FROM file_meta WHERE doc_set_id = ?1 AND file_path = ?2")?;
    let result = stmt
        .query_row(params![doc_set_id, file_path], row_to_file_meta)
        .optional()?;
    Ok(result)
}

pub fn list_by_doc_set(conn: &Connection, doc_set_id: &str) -> AppResult<Vec<FileMeta>> {
    let mut stmt =
        conn.prepare("SELECT * FROM file_meta WHERE doc_set_id = ?1 ORDER BY file_path")?;
    let rows = stmt.query_map(params![doc_set_id], row_to_file_meta)?;
    let metas: Vec<FileMeta> = rows.filter_map(|r| r.ok()).collect();
    Ok(metas)
}

pub fn list_bookmarked(conn: &Connection, doc_set_id: &str) -> AppResult<Vec<FileMeta>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM file_meta WHERE doc_set_id = ?1 AND bookmarked = 1 ORDER BY file_path",
    )?;
    let rows = stmt.query_map(params![doc_set_id], row_to_file_meta)?;
    let metas: Vec<FileMeta> = rows.filter_map(|r| r.ok()).collect();
    Ok(metas)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM file_meta WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

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

    fn make_meta(id: &str, path: &str, bookmarked: bool) -> FileMeta {
        let now = chrono::Utc::now();
        FileMeta {
            id: id.into(),
            doc_set_id: "ds1".into(),
            file_path: path.into(),
            tags: None,
            notes: None,
            bookmarked,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn test_upsert_and_find() {
        let conn = setup_db();
        upsert(&conn, &make_meta("m1", "README.md", false)).unwrap();

        let found = find_by_path(&conn, "ds1", "README.md").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().file_path, "README.md");
    }

    #[test]
    fn test_upsert_updates_existing() {
        let conn = setup_db();
        upsert(&conn, &make_meta("m1", "README.md", false)).unwrap();

        let mut updated = make_meta("m2", "README.md", true);
        updated.tags = Some("important".into());
        upsert(&conn, &updated).unwrap();

        let found = find_by_path(&conn, "ds1", "README.md").unwrap().unwrap();
        assert!(found.bookmarked);
        assert_eq!(found.tags, Some("important".into()));
    }

    #[test]
    fn test_list_bookmarked() {
        let conn = setup_db();
        upsert(&conn, &make_meta("m1", "a.md", true)).unwrap();
        upsert(&conn, &make_meta("m2", "b.md", false)).unwrap();
        upsert(&conn, &make_meta("m3", "c.md", true)).unwrap();

        let bookmarked = list_bookmarked(&conn, "ds1").unwrap();
        assert_eq!(bookmarked.len(), 2);
    }

    #[test]
    fn test_delete() {
        let conn = setup_db();
        upsert(&conn, &make_meta("m1", "a.md", false)).unwrap();
        delete(&conn, "m1").unwrap();

        let found = find_by_path(&conn, "ds1", "a.md").unwrap();
        assert!(found.is_none());
    }
}
