use rusqlite::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Plugin-scoped managed state. The session and forward registries are added
/// in the terminal and port-forwarding milestones; for now the SQLite handle
/// backs host/group/snippet metadata.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(conn)),
        }
    }
}
