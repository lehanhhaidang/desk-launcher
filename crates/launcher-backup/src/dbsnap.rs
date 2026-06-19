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

/// Overwrite `dst` with `bytes`, clearing stale WAL/SHM sidecars first.
///
/// The parent directory is created automatically.
pub fn restore(dst: &Path, bytes: &[u8]) -> Result<(), BackupError> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    for ext in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", dst.display(), ext));
        let _ = std::fs::remove_file(side);
    }
    std::fs::write(dst, bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn snapshot_then_restore_db_bytes() {
        // Create a tiny SQLite DB in the OS temp dir.
        let tmp = std::env::temp_dir()
            .join(format!("dl-dbsnap-test-{}.db", std::process::id()));
        {
            let c = Connection::open(&tmp).unwrap();
            c.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);")
                .unwrap();
        }

        // Snapshot it.
        let bytes = snapshot(&tmp).unwrap();
        assert!(!bytes.is_empty(), "snapshot must not be empty for an existing db");

        // Wipe the original, then restore from bytes.
        std::fs::remove_file(&tmp).ok();
        restore(&tmp, &bytes).unwrap();

        // Verify the data came back.
        let c = Connection::open(&tmp).unwrap();
        let x: i64 = c
            .query_row("SELECT x FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(x, 42);

        // Cleanup.
        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn snapshot_nonexistent_returns_empty() {
        let p = std::env::temp_dir().join("dl-dbsnap-nonexistent-99999999.db");
        let _ = std::fs::remove_file(&p); // ensure it doesn't exist
        let bytes = snapshot(&p).unwrap();
        assert!(bytes.is_empty());
    }
}
