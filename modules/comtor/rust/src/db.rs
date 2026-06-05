use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

/// Initialize the Comtor SQLite DB under the launcher's per-module data dir
/// (`%APPDATA%\io.desklauncher\modules\comtor\`). Also creates
/// the sibling `audio/` directory for stored meeting recordings.
pub fn init() -> AppResult<DbState> {
    let dir = launcher_paths::module_data_dir("comtor")
        .map_err(|e| AppError::Internal(format!("module data dir: {e}")))?;
    std::fs::create_dir_all(dir.join("audio"))?;

    let db_path = dir.join("vcomtor.db");
    let conn = Connection::open(&db_path)?;
    conn.execute_batch(SCHEMA)?;
    conn.execute(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1')",
        [],
    )?;

    Ok(DbState(Mutex::new(conn)))
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  client_name   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress',
  mode            TEXT NOT NULL DEFAULT 'standard',
  duration_ms     INTEGER DEFAULT 0,
  entry_count     INTEGER DEFAULT 0,
  started_at      INTEGER,
  ended_at        INTEGER,
  audio_path      TEXT,
  summary         TEXT,
  speaker_mapping TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_entries (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ord             INTEGER NOT NULL,
  speaker_id      TEXT,
  speaker_label   TEXT,
  speaker_number  INTEGER,
  language        TEXT,
  original_text   TEXT NOT NULL,
  translated_text TEXT,
  start_ms        INTEGER NOT NULL,
  end_ms          INTEGER NOT NULL,
  confidence      REAL DEFAULT 0,
  is_reply        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_entries_meeting ON transcript_entries(meeting_id, ord);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
"#;

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
