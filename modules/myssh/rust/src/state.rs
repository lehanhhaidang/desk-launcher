use crate::services::forward::ForwardHandle;
use crate::services::ssh_client::SessionRequest;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

/// Plugin-scoped managed state.
///
/// - `db` backs host/group/snippet/forward metadata.
/// - `sessions` maps a live session id to the sender that drives its SSH
///   channel task (input, resize, close). The task itself owns the russh
///   handle + channel.
/// - `forwards` maps a running forward id to its task handle.
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub sessions: Arc<Mutex<HashMap<String, mpsc::Sender<SessionRequest>>>>,
    pub forwards: Arc<Mutex<HashMap<String, ForwardHandle>>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(conn)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            forwards: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
