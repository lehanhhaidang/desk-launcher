use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub watchers: Arc<Mutex<HashMap<String, notify::RecommendedWatcher>>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(conn)),
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
