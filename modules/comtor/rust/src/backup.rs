//! Comtor backup contract — export_data / import_data.
//!
//! Payload layout inside the bundle:
//! - `db.sqlite`         — consistent VACUUM snapshot of `vcomtor.db`
//! - `settings.json`     — module preferences (if present)
//! - `audio/<name>.webm` — meeting audio recordings (only when `include_heavy`)
//! - secrets             — `soniox_api_key` and `openai_api_key` from keyring

use launcher_backup::{BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry};
use std::path::PathBuf;

const MODULE_ID: &str = "comtor";
const SERVICE: &str = "virtual_comtor";
const KEY_ACCOUNTS: [&str; 2] = ["soniox_api_key", "openai_api_key"];

fn data_dir() -> Result<PathBuf, BackupError> {
    launcher_paths::module_data_dir(MODULE_ID).map_err(|e| BackupError::Io(e.to_string()))
}

/// Export Comtor data: DB snapshot + settings + secrets + (optionally) audio files.
pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();
    let dir = data_dir()?;

    // --- DB snapshot ---
    let db = launcher_backup::dbsnap::snapshot(&dir.join("vcomtor.db"))?;
    if !db.is_empty() {
        out.files.push(ExportFile {
            rel_path: "db.sqlite".into(),
            bytes: db,
        });
    }

    // --- settings.json ---
    let settings = dir.join("settings.json");
    if settings.is_file() {
        out.files.push(ExportFile {
            rel_path: "settings.json".into(),
            bytes: std::fs::read(&settings)?,
        });
    }

    // --- Secrets: two fixed keyring accounts ---
    for acct in KEY_ACCOUNTS {
        match keyring::Entry::new(SERVICE, acct) {
            Ok(entry) => match entry.get_password() {
                Ok(v) => out.secrets.push(SecretEntry {
                    account: acct.into(),
                    value: v,
                }),
                Err(keyring::Error::NoEntry) => {}
                Err(_) => {}
            },
            Err(_) => {}
        }
    }

    // --- Optional audio files ---
    if opts.include_heavy {
        let audio = dir.join("audio");
        if audio.is_dir() {
            for e in std::fs::read_dir(&audio)?.flatten() {
                let p = e.path();
                if p.is_file() {
                    let name = p.file_name().unwrap().to_string_lossy().to_string();
                    out.files.push(ExportFile {
                        rel_path: format!("audio/{name}"),
                        bytes: std::fs::read(&p)?,
                    });
                }
            }
        }
    }

    Ok(out)
}

/// Import Comtor data: restore DB + settings + audio files + secrets into keyring.
pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    let dir = data_dir()?;
    std::fs::create_dir_all(&dir)?;

    // --- DB restore ---
    if let Some(db_file) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        launcher_backup::dbsnap::restore(&dir.join("vcomtor.db"), &db_file.bytes)?;
    }

    // --- settings.json ---
    if let Some(s) = input.files.iter().find(|f| f.rel_path == "settings.json") {
        std::fs::write(dir.join("settings.json"), &s.bytes)?;
    }

    // --- Audio files ---
    let audio = dir.join("audio");
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("audio/")) {
        std::fs::create_dir_all(&audio)?;
        let name = f.rel_path.trim_start_matches("audio/");
        std::fs::write(audio.join(name), &f.bytes)?;
    }

    // --- Secrets → OS keyring ---
    for s in &input.secrets {
        keyring::Entry::new(SERVICE, &s.account)
            .and_then(|e| e.set_password(&s.value))
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }

    Ok(())
}
