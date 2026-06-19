//! MySSH backup contract — export_data / import_data.
//!
//! Payload layout inside the bundle:
//! - `db.sqlite`      — consistent VACUUM snapshot of `myssh.db`
//! - `secrets.json`   — `{ "<host_id>": "<secret>" }` map (encrypted at rest
//!                      by the bundle layer, not here)
//! - `keys/<name>`    — raw SSH private-key files (only when `include_heavy`)

use launcher_backup::{BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry};
use std::path::Path;

const MODULE_ID: &str = "myssh";
const DB_NAME: &str = "myssh.db";

fn db_path() -> Result<std::path::PathBuf, BackupError> {
    launcher_paths::module_data_file(MODULE_ID, DB_NAME)
        .map_err(|e| BackupError::Io(format!("db path: {e}")))
}

fn collect_host_ids() -> Result<Vec<String>, BackupError> {
    let conn = crate::db::open().map_err(|e| BackupError::Db(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id FROM hosts")
        .map_err(|e| BackupError::Db(e.to_string()))?;
    let ids = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| BackupError::Db(e.to_string()))?
        .filter_map(Result::ok)
        .collect();
    Ok(ids)
}

fn collect_key_path_for(host_id: &str) -> Result<Option<String>, BackupError> {
    let conn = crate::db::open().map_err(|e| BackupError::Db(e.to_string()))?;
    conn.query_row(
        "SELECT key_path FROM hosts WHERE id = ?1",
        [host_id],
        |r| r.get::<_, Option<String>>(0),
    )
    .map_err(|e| BackupError::Db(e.to_string()))
}

/// Export MySSH data: DB snapshot + secrets + (optionally) key files.
pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();

    // --- DB snapshot ---
    let db = launcher_backup::dbsnap::snapshot(&db_path()?)?;
    if !db.is_empty() {
        out.files.push(ExportFile {
            rel_path: "db.sqlite".into(),
            bytes: db,
        });
    }

    // --- Secrets and optional key files, per host ---
    for id in collect_host_ids()? {
        if let Some(secret) = crate::utils::secret_store::get_host_secret(&id)
            .map_err(|e| BackupError::Keyring(e.to_string()))?
        {
            out.secrets.push(SecretEntry {
                account: id.clone(),
                value: secret,
            });
        }

        if opts.include_heavy {
            if let Some(key_path) = collect_key_path_for(&id)? {
                let p = Path::new(&key_path);
                if p.is_file() {
                    if let Ok(bytes) = std::fs::read(p) {
                        let name = p
                            .file_name()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_else(|| format!("{id}.key"));
                        out.files.push(ExportFile {
                            rel_path: format!("keys/{name}"),
                            bytes,
                        });
                    }
                }
            }
        }
    }

    Ok(out)
}

/// Import MySSH data: restore DB + key files + secrets into keyring.
pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    // --- DB restore ---
    if let Some(db_file) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        launcher_backup::dbsnap::restore(&db_path()?, &db_file.bytes)?;
    }

    // --- Key files → module data dir `keys/` ---
    let keys_dir = launcher_paths::module_data_dir(MODULE_ID)
        .map_err(|e| BackupError::Io(e.to_string()))?
        .join("keys");
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("keys/")) {
        std::fs::create_dir_all(&keys_dir)?;
        let name = f.rel_path.trim_start_matches("keys/");
        std::fs::write(keys_dir.join(name), &f.bytes)?;
    }

    // --- Secrets → OS keyring ---
    for s in &input.secrets {
        crate::utils::secret_store::store_host_secret(&s.account, &s.value)
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }

    Ok(())
}
