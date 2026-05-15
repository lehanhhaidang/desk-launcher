pub mod factory;
pub mod git_provider;

use crate::error::AppResult;
use async_trait::async_trait;
use std::path::Path;

#[derive(Debug)]
pub enum SyncStatus {
    UpToDate,
    LocalChanges { changed_files: Vec<String> },
    RemoteChanges { changed_files: Vec<String> },
    Conflict { conflicted_files: Vec<String> },
}

pub struct PullResult {
    pub updated_files: Vec<String>,
    pub conflicted_files: Vec<String>,
}

#[async_trait]
pub trait SyncProvider: Send + Sync {
    async fn push(&self, staging_path: &Path, message: Option<&str>) -> AppResult<String>;
    async fn pull(&self, staging_path: &Path) -> AppResult<PullResult>;
    async fn force_push(&self, staging_path: &Path, message: Option<&str>) -> AppResult<String>;
    async fn force_pull(&self, staging_path: &Path) -> AppResult<PullResult>;
    async fn status(&self, staging_path: &Path) -> AppResult<SyncStatus>;
    async fn init_local(&self, staging_path: &Path) -> AppResult<()>;
    async fn init_remote(&self, name: &str, private: bool) -> AppResult<String>;
    fn provider_name(&self) -> &str;
}
