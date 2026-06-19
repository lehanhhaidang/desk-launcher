//! Shared SQLite snapshot / restore helpers used by all modules that include
//! a database in their backup payload.
//!
//! Uses `VACUUM INTO` to produce a consistent, WAL-free snapshot of any
//! SQLite database file, regardless of the journal mode currently in use.

use crate::BackupError;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

/// Create a consistent binary snapshot of the SQLite database at `src`.
///
/// Returns `Ok(Vec::new())` if `src` does not exist (module never used).
/// Otherwise vacuums into a uniquely-named temp file and reads the bytes back.
pub fn snapshot(src: &Path) -> Result<Vec<u8>, BackupError> {
    if !src.exists() {
        return Ok(Vec::new());
    }
    let stem = src
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let out: PathBuf = std::env::temp_dir()
        .join(format!("dl-snap-{}-{}.db", stem, std::process::id()));
    let _ = std::fs::remove_file(&out);
    let conn = Connection::open(src).map_err(|e| BackupError::Db(e.to_string()))?;
    conn.execute("VACUUM INTO ?1", [out.to_string_lossy().to_string()])
        .map_err(|e| BackupError::Db(e.to_string()))?;
    let bytes = std::fs::read(&out)?;
    let _ = std::fs::remove_file(&out);
    Ok(bytes)
}

/// Restore `dst` from `bytes` using SQLite's online backup API.
///
/// This coordinates safely with any existing open `Connection` on `dst`
/// (e.g. a process-lifetime plugin connection that is not released when the
/// module window closes), avoiding the page-cache / WAL corruption that a
/// raw `fs::write` over a live file would cause.
///
/// The parent directory is created automatically.
pub fn restore(dst: &Path, bytes: &[u8]) -> Result<(), BackupError> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Write the snapshot bytes to a uniquely-named temp file so we can open
    // it as a SQLite source connection.
    let stem = dst
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let tmp: PathBuf = std::env::temp_dir()
        .join(format!("dl-restore-{}-{}.db", stem, std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, bytes)?;

    // Use the SQLite online backup API to copy src → dst.  This is safe even
    // when another Connection already has dst open.
    let src = Connection::open(&tmp).map_err(|e| BackupError::Db(e.to_string()))?;
    let mut dest = Connection::open(dst).map_err(|e| BackupError::Db(e.to_string()))?;
    {
        let backup = rusqlite::backup::Backup::new(&src, &mut dest)
            .map_err(|e| BackupError::Db(e.to_string()))?;
        backup
            .run_to_completion(100, std::time::Duration::from_millis(0), None)
            .map_err(|e| BackupError::Db(e.to_string()))?;
    }

    // Clean up the temp file; ignore errors (best-effort).
    let _ = std::fs::remove_file(&tmp);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn snapshot_then_restore_db_bytes() {
        // Create a tiny SQLite DB in the OS temp dir.
        let dst = std::env::temp_dir()
            .join(format!("dl-dbsnap-test-{}.db", std::process::id()));
        {
            let c = Connection::open(&dst).unwrap();
            c.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);")
                .unwrap();
        }

        // Snapshot it.
        let bytes = snapshot(&dst).unwrap();
        assert!(!bytes.is_empty(), "snapshot must not be empty for an existing db");

        // Wipe the original, then restore from bytes.
        std::fs::remove_file(&dst).ok();
        restore(&dst, &bytes).unwrap();

        // Verify the data came back.
        let c = Connection::open(&dst).unwrap();
        let x: i64 = c
            .query_row("SELECT x FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(x, 42);

        // Cleanup.
        std::fs::remove_file(&dst).ok();
    }

    #[test]
    fn snapshot_nonexistent_returns_empty() {
        let p = std::env::temp_dir().join("dl-dbsnap-nonexistent-99999999.db");
        let _ = std::fs::remove_file(&p); // ensure it doesn't exist
        let bytes = snapshot(&p).unwrap();
        assert!(bytes.is_empty());
    }

    /// Prove M2: restore via the SQLite backup API is safe even when a
    /// process-lifetime connection already has `dst` open.
    ///
    /// Simulates the case where Comtor / Open Sesame's plugin `.setup()`
    /// connection is never released (closing the window does not drop it).
    #[test]
    fn restore_through_live_connection() {
        let dst = std::env::temp_dir()
            .join(format!("dl-dbsnap-live-{}.db", std::process::id()));

        // 1. Create the "live" connection and write some initial data.
        let live_conn = Connection::open(&dst).unwrap();
        live_conn
            .execute_batch("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('original');")
            .unwrap();

        // 2. Snapshot a DIFFERENT database that holds the restored data.
        let src_db = std::env::temp_dir()
            .join(format!("dl-dbsnap-live-src-{}.db", std::process::id()));
        {
            let c = Connection::open(&src_db).unwrap();
            c.execute_batch("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('restored');")
                .unwrap();
        }
        let restored_bytes = snapshot(&src_db).unwrap();
        std::fs::remove_file(&src_db).ok();

        // 3. Restore into `dst` while `live_conn` is still open.
        restore(&dst, &restored_bytes).unwrap();

        // 4. Re-open dst on the still-open live connection and confirm it sees
        //    the restored data (not the original), proving no corruption.
        let x: String = live_conn
            .query_row("SELECT x FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(x, "restored", "live connection should see the restored data");

        // Cleanup.
        drop(live_conn);
        std::fs::remove_file(&dst).ok();
    }
}
