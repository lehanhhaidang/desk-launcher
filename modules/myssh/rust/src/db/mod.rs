pub mod group_repo;
pub mod host_repo;
pub mod known_hosts_repo;
pub mod migrations;

use crate::error::{AppError, AppResult};
use rusqlite::Connection;

/// Open (creating if needed) the module's SQLite database under the launcher's
/// per-module data dir and run migrations.
pub fn open() -> AppResult<Connection> {
    let path = launcher_paths::module_data_file("myssh", "myssh.db")
        .map_err(|e| AppError::Internal(format!("resolve db path: {e}")))?;
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrations::run(&conn)?;
    Ok(conn)
}
