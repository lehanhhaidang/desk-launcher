use crate::db::file_meta_repo::{self, FileMeta};
use crate::error::AppResult;
use rusqlite::Connection;

pub fn toggle_bookmark(db: &Connection, doc_set_id: &str, file_path: &str) -> AppResult<bool> {
    let existing = file_meta_repo::find_by_path(db, doc_set_id, file_path)?;

    match existing {
        Some(mut meta) => {
            meta.bookmarked = !meta.bookmarked;
            meta.updated_at = chrono::Utc::now();
            file_meta_repo::upsert(db, &meta)?;
            Ok(meta.bookmarked)
        }
        None => {
            let now = chrono::Utc::now();
            let meta = FileMeta {
                id: uuid::Uuid::new_v4().to_string(),
                doc_set_id: doc_set_id.into(),
                file_path: file_path.into(),
                tags: None,
                notes: None,
                bookmarked: true,
                created_at: now,
                updated_at: now,
            };
            file_meta_repo::upsert(db, &meta)?;
            Ok(true)
        }
    }
}

pub fn set_tags(
    db: &Connection,
    doc_set_id: &str,
    file_path: &str,
    tags: Vec<String>,
) -> AppResult<()> {
    let tags_str = tags.join(",");
    let existing = file_meta_repo::find_by_path(db, doc_set_id, file_path)?;

    match existing {
        Some(mut meta) => {
            meta.tags = Some(tags_str);
            meta.updated_at = chrono::Utc::now();
            file_meta_repo::upsert(db, &meta)?;
        }
        None => {
            let now = chrono::Utc::now();
            let meta = FileMeta {
                id: uuid::Uuid::new_v4().to_string(),
                doc_set_id: doc_set_id.into(),
                file_path: file_path.into(),
                tags: Some(tags_str),
                notes: None,
                bookmarked: false,
                created_at: now,
                updated_at: now,
            };
            file_meta_repo::upsert(db, &meta)?;
        }
    }
    Ok(())
}

pub fn set_notes(
    db: &Connection,
    doc_set_id: &str,
    file_path: &str,
    notes: String,
) -> AppResult<()> {
    let existing = file_meta_repo::find_by_path(db, doc_set_id, file_path)?;

    match existing {
        Some(mut meta) => {
            meta.notes = Some(notes);
            meta.updated_at = chrono::Utc::now();
            file_meta_repo::upsert(db, &meta)?;
        }
        None => {
            let now = chrono::Utc::now();
            let meta = FileMeta {
                id: uuid::Uuid::new_v4().to_string(),
                doc_set_id: doc_set_id.into(),
                file_path: file_path.into(),
                tags: None,
                notes: Some(notes),
                bookmarked: false,
                created_at: now,
                updated_at: now,
            };
            file_meta_repo::upsert(db, &meta)?;
        }
    }
    Ok(())
}

pub fn list_bookmarks(db: &Connection, doc_set_id: &str) -> AppResult<Vec<FileMeta>> {
    file_meta_repo::list_bookmarked(db, doc_set_id)
}

pub fn get_meta(db: &Connection, doc_set_id: &str, file_path: &str) -> AppResult<Option<FileMeta>> {
    file_meta_repo::find_by_path(db, doc_set_id, file_path)
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
             VALUES ('ws1', 'WS', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO accounts (id, provider, username, token, is_default, created_at, updated_at)
             VALUES ('acc1', 'github', 'user', 'tok', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')", [],
        ).unwrap();
        conn.execute(
            "INSERT INTO doc_sets (id, workspace_id, account_id, display_name, source_path,
             strategy, provider_type, branch, auto_sync, status, sort_order, created_at, updated_at)
             VALUES ('ds1', 'ws1', 'acc1', 'Docs', '/tmp', 'standalone', 'github',
             'main', 0, 'idle', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_toggle_bookmark_on() {
        let db = setup_db();
        let result = toggle_bookmark(&db, "ds1", "readme.md").unwrap();
        assert!(result);
    }

    #[test]
    fn test_toggle_bookmark_off() {
        let db = setup_db();
        toggle_bookmark(&db, "ds1", "readme.md").unwrap();
        let result = toggle_bookmark(&db, "ds1", "readme.md").unwrap();
        assert!(!result);
    }

    #[test]
    fn test_set_tags() {
        let db = setup_db();
        set_tags(&db, "ds1", "readme.md", vec!["api".into(), "guide".into()]).unwrap();
        let meta = get_meta(&db, "ds1", "readme.md").unwrap().unwrap();
        assert_eq!(meta.tags, Some("api,guide".into()));
    }

    #[test]
    fn test_set_notes() {
        let db = setup_db();
        set_notes(&db, "ds1", "readme.md", "Important file".into()).unwrap();
        let meta = get_meta(&db, "ds1", "readme.md").unwrap().unwrap();
        assert_eq!(meta.notes, Some("Important file".into()));
    }

    #[test]
    fn test_list_bookmarks_only_returns_bookmarked() {
        let db = setup_db();
        toggle_bookmark(&db, "ds1", "readme.md").unwrap();
        set_notes(&db, "ds1", "other.md", "note".into()).unwrap();
        let bookmarks = list_bookmarks(&db, "ds1").unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].file_path, "readme.md");
    }
}
