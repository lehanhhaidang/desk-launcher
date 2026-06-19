//! Open Sesame backup — `export_data` / `import_data` wiring.
//!
//! Calls `launcher_backup::dbsnap::{snapshot, restore}` for SQLite snapshots,
//! reads / writes secrets via the OS keyring (service `open-sesame`), and
//! optionally includes every file under the mirrors directory.

use launcher_backup::{
    BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry,
};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

fn db_path() -> Result<PathBuf, BackupError> {
    crate::utils::paths::db_path().map_err(|e| BackupError::Io(e.to_string()))
}

/// Export Open Sesame data into a `ModuleExport` payload.
///
/// - `db.sqlite` — consistent snapshot via `VACUUM INTO`; omitted if the DB
///   does not yet exist (module never initialised).
/// - Secrets — each `accounts.token` ref in the form `keyring:<key>` is
///   resolved to its plaintext and stored as `SecretEntry { account: <key>, … }`.
/// - `mirrors/**` — every file under `~/.open-sesame/mirrors/` is included
///   only when `opts.include_heavy` is true (these can be large git working copies).
pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();

    // 1. Database snapshot.
    let db = launcher_backup::dbsnap::snapshot(&db_path()?)?;
    if !db.is_empty() {
        out.files.push(ExportFile {
            rel_path: "db.sqlite".into(),
            bytes: db,
        });
    }

    // 2. Secrets: read `accounts.token` refs and resolve plaintext.
    let conn = Connection::open(db_path()?).map_err(|e| BackupError::Db(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT token FROM accounts")
        .map_err(|e| BackupError::Db(e.to_string()))?;
    let refs: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| BackupError::Db(e.to_string()))?
        .filter_map(Result::ok)
        .collect();
    for token_ref in refs {
        if let Some(account) = token_ref.strip_prefix("keyring:") {
            if let Ok(plain) = crate::utils::secret_store::resolve_token(&token_ref) {
                out.secrets.push(SecretEntry {
                    account: account.to_string(),
                    value: plain,
                });
            }
        }
    }

    // 3. Optional heavy files: git mirrors.
    if opts.include_heavy {
        let mirrors = crate::utils::paths::mirrors_dir()
            .map_err(|e| BackupError::Io(e.to_string()))?;
        collect_dir(&mirrors, "mirrors", &mut out.files)?;
    }

    Ok(out)
}

/// Import Open Sesame data from a `ModuleImport` payload.
///
/// - Restores `db.sqlite` if present (overwrites current DB, clears WAL/SHM).
/// - Writes `mirrors/…` files back under `~/.open-sesame/mirrors/`.
/// - Re-stores every secret via `keyring::Entry::new("open-sesame", account)`.
pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    // 1. Database restore.
    if let Some(db) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        launcher_backup::dbsnap::restore(&db_path()?, &db.bytes)?;
    }

    // 2. Mirror files.
    let mirrors = crate::utils::paths::mirrors_dir()
        .map_err(|e| BackupError::Io(e.to_string()))?;
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("mirrors/")) {
        let rel = f.rel_path.trim_start_matches("mirrors/");
        let dst = mirrors.join(rel);
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&dst, &f.bytes)?;
    }

    // 3. Secrets: re-store under keyring service `open-sesame`.
    for s in &input.secrets {
        keyring::Entry::new("open-sesame", &s.account)
            .and_then(|e| e.set_password(&s.value))
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Recursively collect all files under `root` into `files`, with rel_path
/// prefixed by `prefix/`.
fn collect_dir(root: &Path, prefix: &str, files: &mut Vec<ExportFile>) -> Result<(), BackupError> {
    if !root.exists() {
        return Ok(());
    }
    for path in walk(root) {
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = std::fs::read(&path)?;
        files.push(ExportFile {
            rel_path: format!("{prefix}/{rel}"),
            bytes,
        });
    }
    Ok(())
}

/// Iterative depth-first walk; returns only files (not directories).
fn walk(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    stack.push(p);
                } else {
                    out.push(p);
                }
            }
        }
    }
    out
}
