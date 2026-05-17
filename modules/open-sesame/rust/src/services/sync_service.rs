use crate::db::{doc_set_repo, sync_log_repo};
use crate::error::{AppError, AppResult};
use crate::models::doc_set::{DocSet, DocSetStatus};
use crate::models::sync_log::{SyncLog, SyncLogStatus};
use crate::providers::{factory, SyncProvider, SyncStatus};
use crate::services::doc_set_manifest_service;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(serde::Serialize, Clone, Debug)]
pub struct SyncResult {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub files_count: usize,
    pub message: String,
    pub issue: Option<SyncIssue>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct SyncIssue {
    pub kind: String,
    pub message: String,
    pub details: Option<String>,
    pub recoverable: bool,
    pub actions: Vec<String>,
}

/// Sync Up: local → remote
/// Note: We split DB operations and async provider calls to avoid holding
/// &Connection (not Send) across .await boundaries.
pub async fn sync_up(
    db: Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
    doc_set_id: &str,
    commit_message: Option<String>,
) -> AppResult<SyncResult> {
    let (doc_set, provider) = {
        let db = db.lock().await;
        let doc_set = doc_set_repo::find_by_id(&db, doc_set_id)?
            .ok_or_else(|| AppError::NotFound("Doc set".into()))?;

        if doc_set.status == DocSetStatus::Syncing {
            return Err(AppError::Sync("Sync already in progress".into()));
        }

        if doc_set.remote_url.is_none() {
            return Ok(SyncResult {
                success: false,
                commit_hash: None,
                files_count: 0,
                message: "GitHub setup required before sync".into(),
                issue: Some(setup_required_issue()),
            });
        }

        let provider = factory::create_provider(&db, &doc_set)?;
        doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Syncing)?;
        (doc_set, provider)
    };

    emit_sync_status(app_handle, doc_set_id, "started", None);

    let result = execute_sync_up(&doc_set, provider.as_ref(), commit_message.as_deref()).await;

    let db = db.lock().await;
    match &result {
        Ok(sync_result) => {
            if let Some(hash) = sync_result
                .commit_hash
                .as_deref()
                .filter(|hash| !hash.is_empty())
            {
                doc_set_repo::update_sync_state(&db, doc_set_id, hash, chrono::Utc::now())?;
            } else {
                doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Idle)?;
            }
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    "up".into(),
                    sync_result.commit_hash.clone(),
                    Some(sync_result.message.clone()),
                    sync_result.files_count as i32,
                    SyncLogStatus::Success,
                    None,
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "completed", None);
        }
        Err(err) => {
            let issue = classify_sync_error(err);
            doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Error)?;
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    "up".into(),
                    None,
                    None,
                    0,
                    SyncLogStatus::Error,
                    Some(issue.message.clone()),
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "failed", Some(&issue.message));
            return Ok(SyncResult {
                success: false,
                commit_hash: None,
                files_count: 0,
                message: issue.message.clone(),
                issue: Some(issue),
            });
        }
    }
    result
}

/// Sync Down: remote → local
pub async fn sync_down(
    db: Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
    doc_set_id: &str,
) -> AppResult<SyncResult> {
    let (doc_set, provider) = {
        let db = db.lock().await;
        let doc_set = doc_set_repo::find_by_id(&db, doc_set_id)?
            .ok_or_else(|| AppError::NotFound("Doc set".into()))?;

        if doc_set.status == DocSetStatus::Syncing {
            return Err(AppError::Sync("Sync already in progress".into()));
        }

        if doc_set.remote_url.is_none() {
            return Ok(SyncResult {
                success: false,
                commit_hash: None,
                files_count: 0,
                message: "GitHub setup required before sync".into(),
                issue: Some(setup_required_issue()),
            });
        }

        let provider = factory::create_provider(&db, &doc_set)?;
        doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Syncing)?;
        (doc_set, provider)
    };

    emit_sync_status(app_handle, doc_set_id, "started", None);

    let result = execute_sync_down(&doc_set, provider.as_ref()).await;

    let db = db.lock().await;
    match &result {
        Ok(sync_result) => {
            if let Some(hash) = sync_result
                .commit_hash
                .as_deref()
                .filter(|hash| !hash.is_empty())
            {
                doc_set_repo::update_sync_state(&db, doc_set_id, hash, chrono::Utc::now())?;
            } else {
                doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Idle)?;
            }
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    "down".into(),
                    sync_result.commit_hash.clone(),
                    Some(sync_result.message.clone()),
                    sync_result.files_count as i32,
                    SyncLogStatus::Success,
                    None,
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "completed", None);
        }
        Err(err) => {
            let issue = classify_sync_error(err);
            doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Error)?;
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    "down".into(),
                    None,
                    None,
                    0,
                    SyncLogStatus::Error,
                    Some(issue.message.clone()),
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "failed", Some(&issue.message));
            return Ok(SyncResult {
                success: false,
                commit_hash: None,
                files_count: 0,
                message: issue.message.clone(),
                issue: Some(issue),
            });
        }
    }
    result
}

pub async fn force_push(
    db: Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
    doc_set_id: &str,
    commit_message: Option<String>,
) -> AppResult<SyncResult> {
    let (doc_set, provider) = prepare_sync(db.clone(), doc_set_id).await?;
    emit_sync_status(app_handle, doc_set_id, "started", None);

    let result = execute_force_push(&doc_set, provider.as_ref(), commit_message.as_deref()).await;
    finish_sync(db, app_handle, doc_set_id, "up", result).await
}

pub async fn force_pull(
    db: Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
    doc_set_id: &str,
) -> AppResult<SyncResult> {
    let (doc_set, provider) = prepare_sync(db.clone(), doc_set_id).await?;
    emit_sync_status(app_handle, doc_set_id, "started", None);

    let result = execute_force_pull(&doc_set, provider.as_ref()).await;
    finish_sync(db, app_handle, doc_set_id, "down", result).await
}

async fn prepare_sync(
    db: Arc<Mutex<Connection>>,
    doc_set_id: &str,
) -> AppResult<(DocSet, Box<dyn SyncProvider>)> {
    let db = db.lock().await;
    let doc_set = doc_set_repo::find_by_id(&db, doc_set_id)?
        .ok_or_else(|| AppError::NotFound("Doc set".into()))?;

    if doc_set.status == DocSetStatus::Syncing {
        return Err(AppError::Sync("Sync already in progress".into()));
    }

    if doc_set.remote_url.is_none() {
        return Err(AppError::Sync("GitHub setup required before sync".into()));
    }

    let provider = factory::create_provider(&db, &doc_set)?;
    doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Syncing)?;
    Ok((doc_set, provider))
}

async fn finish_sync(
    db: Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
    doc_set_id: &str,
    direction: &str,
    result: AppResult<SyncResult>,
) -> AppResult<SyncResult> {
    let db = db.lock().await;
    match result {
        Ok(sync_result) => {
            if let Some(hash) = sync_result
                .commit_hash
                .as_deref()
                .filter(|hash| !hash.is_empty())
            {
                doc_set_repo::update_sync_state(&db, doc_set_id, hash, chrono::Utc::now())?;
            } else {
                doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Idle)?;
            }
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    direction.into(),
                    sync_result.commit_hash.clone(),
                    Some(sync_result.message.clone()),
                    sync_result.files_count as i32,
                    SyncLogStatus::Success,
                    None,
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "completed", None);
            Ok(sync_result)
        }
        Err(err) => {
            let issue = classify_sync_error(&err);
            doc_set_repo::update_status(&db, doc_set_id, &DocSetStatus::Error)?;
            sync_log_repo::insert(
                &db,
                &SyncLog::new(
                    doc_set_id.into(),
                    direction.into(),
                    None,
                    None,
                    0,
                    SyncLogStatus::Error,
                    Some(issue.message.clone()),
                ),
            )?;
            emit_sync_status(app_handle, doc_set_id, "failed", Some(&issue.message));
            Ok(SyncResult {
                success: false,
                commit_hash: None,
                files_count: 0,
                message: issue.message.clone(),
                issue: Some(issue),
            })
        }
    }
}

async fn execute_sync_up(
    doc_set: &DocSet,
    provider: &dyn SyncProvider,
    commit_message: Option<&str>,
) -> AppResult<SyncResult> {
    let staging_path = resolve_staging_path(doc_set)?;

    let staging = Path::new(&staging_path);
    provider.init_local(staging).await?;
    if matches!(provider.status(staging).await?, SyncStatus::UpToDate) {
        doc_set_manifest_service::copy_enabled_local_to_mirror(doc_set)?;
    }
    let files_count = changed_file_count(provider.status(staging).await?);
    let commit_hash = provider.push(staging, commit_message).await?;

    Ok(SyncResult {
        success: true,
        commit_hash: if commit_hash.is_empty() {
            doc_set.last_commit.clone()
        } else {
            Some(commit_hash)
        },
        files_count,
        message: if files_count == 0 {
            "Already up to date".into()
        } else {
            format!("Pushed {} change(s)", files_count)
        },
        issue: None,
    })
}

async fn execute_force_push(
    doc_set: &DocSet,
    provider: &dyn SyncProvider,
    commit_message: Option<&str>,
) -> AppResult<SyncResult> {
    let staging_path = resolve_staging_path(doc_set)?;
    let staging = Path::new(&staging_path);

    provider.init_local(staging).await?;
    if matches!(provider.status(staging).await?, SyncStatus::UpToDate) {
        doc_set_manifest_service::copy_enabled_local_to_mirror(doc_set)?;
    }
    let files_count = changed_file_count(provider.status(staging).await?);
    let commit_hash = provider.force_push(staging, commit_message).await?;

    Ok(SyncResult {
        success: true,
        commit_hash: if commit_hash.is_empty() {
            doc_set.last_commit.clone()
        } else {
            Some(commit_hash)
        },
        files_count,
        message: "Force pushed local mirror to remote".into(),
        issue: None,
    })
}

async fn execute_sync_down(doc_set: &DocSet, provider: &dyn SyncProvider) -> AppResult<SyncResult> {
    let staging_path = resolve_staging_path(doc_set)?;
    let staging = Path::new(&staging_path);

    provider.init_local(staging).await?;
    let pull_result = provider.pull(staging).await?;
    let mut files_count = pull_result.updated_files.len() + pull_result.conflicted_files.len();

    files_count += doc_set_manifest_service::copy_enabled_mirror_to_local(doc_set)?;

    Ok(SyncResult {
        success: pull_result.conflicted_files.is_empty(),
        commit_hash: current_head_commit(staging),
        files_count,
        message: if pull_result.conflicted_files.is_empty() {
            format!("Pulled {} update(s)", files_count)
        } else {
            format!(
                "Pulled with {} conflict(s)",
                pull_result.conflicted_files.len()
            )
        },
        issue: None,
    })
}

async fn execute_force_pull(
    doc_set: &DocSet,
    provider: &dyn SyncProvider,
) -> AppResult<SyncResult> {
    let staging_path = resolve_staging_path(doc_set)?;
    let staging = Path::new(&staging_path);

    provider.init_local(staging).await?;
    let pull_result = provider.force_pull(staging).await?;
    let files_count = doc_set_manifest_service::copy_enabled_mirror_to_local(doc_set)?;

    Ok(SyncResult {
        success: pull_result.conflicted_files.is_empty(),
        commit_hash: current_head_commit(staging),
        files_count,
        message: "Force pulled remote into local mirror and source".into(),
        issue: None,
    })
}

/// Helper: resolve staging path
pub fn resolve_staging_path(doc_set: &DocSet) -> AppResult<String> {
    doc_set
        .mirror_path
        .clone()
        .ok_or_else(|| AppError::Internal("Mirror-only doc set has no mirror_path".into()))
}

fn changed_file_count(status: SyncStatus) -> usize {
    match status {
        SyncStatus::UpToDate => 0,
        SyncStatus::LocalChanges { changed_files }
        | SyncStatus::RemoteChanges { changed_files } => changed_files.len(),
        SyncStatus::Conflict { conflicted_files } => conflicted_files.len(),
    }
}

fn current_head_commit(staging_path: &Path) -> Option<String> {
    let repo = git2::Repository::open(staging_path).ok()?;
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    Some(commit.id().to_string())
}

fn setup_required_issue() -> SyncIssue {
    SyncIssue {
        kind: "setup_required".into(),
        message: "GitHub setup required before sync".into(),
        details: None,
        recoverable: true,
        actions: vec!["setup_github".into()],
    }
}

fn classify_sync_error(err: &AppError) -> SyncIssue {
    let message = err.to_string();
    let lower = message.to_lowercase();

    if lower.contains("not fast-forward")
        || lower.contains("newer commits")
        || lower.contains("diverged")
        || lower.contains("conflict")
    {
        return SyncIssue {
            kind: "diverged".into(),
            message,
            details: Some(
                "Local and remote histories need user action before normal sync can continue."
                    .into(),
            ),
            recoverable: true,
            actions: vec![
                "retry".into(),
                "force_push".into(),
                "force_pull".into(),
                "resolve_manually".into(),
            ],
        };
    }

    if lower.contains("auth")
        || lower.contains("credential")
        || lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
    {
        return SyncIssue {
            kind: "auth_error".into(),
            message,
            details: Some("GitHub rejected the current token or permissions.".into()),
            recoverable: true,
            actions: vec!["retry".into(), "setup_github".into()],
        };
    }

    if lower.contains("not found") || lower.contains("404") {
        return SyncIssue {
            kind: "repo_missing".into(),
            message,
            details: Some(
                "The configured GitHub repository could not be found or accessed.".into(),
            ),
            recoverable: true,
            actions: vec!["setup_github".into()],
        };
    }

    if matches!(err, AppError::Network(_)) || lower.contains("network") || lower.contains("timeout")
    {
        return SyncIssue {
            kind: "network_error".into(),
            message,
            details: Some("Network connection failed while talking to GitHub.".into()),
            recoverable: true,
            actions: vec!["retry".into()],
        };
    }

    SyncIssue {
        kind: err.error_kind().into(),
        message,
        details: None,
        recoverable: true,
        actions: vec!["retry".into()],
    }
}

fn emit_sync_status(app_handle: &AppHandle, doc_set_id: &str, status: &str, error: Option<&str>) {
    let _ = app_handle.emit(
        "sync:update",
        serde_json::json!({
            "doc_set_id": doc_set_id, "status": status, "error": error,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::account::ProviderType;
    use crate::models::doc_set::Strategy;
    use crate::services::mirror_service;
    use std::fs;
    use tempfile::TempDir;

    fn make_doc_set(strategy: Strategy, source: &str, mirror: Option<String>) -> DocSet {
        let now = chrono::Utc::now();
        DocSet {
            id: "ds-test".into(),
            workspace_id: "ws1".into(),
            account_id: "acc1".into(),
            display_name: "Test Docs".into(),
            source_path: source.into(),
            strategy,
            mirror_path: mirror,
            provider_type: ProviderType::Github,
            remote_url: Some("https://github.com/user/repo.git".into()),
            remote_id: None,
            branch: "main".into(),
            auto_sync: false,
            last_synced_at: None,
            last_commit: None,
            status: DocSetStatus::Idle,
            has_mapping: false,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn test_resolve_staging_path_uses_mirror() {
        let ds = make_doc_set(
            Strategy::Mirrored,
            "/project/docs",
            Some("/mirrors/ds-test".into()),
        );
        assert_eq!(resolve_staging_path(&ds).unwrap(), "/mirrors/ds-test");
    }

    #[test]
    fn test_resolve_staging_path_no_mirror_path_errors() {
        let ds = make_doc_set(Strategy::Mirrored, "/project/docs", None);
        assert!(resolve_staging_path(&ds)
            .unwrap_err()
            .to_string()
            .contains("no mirror_path"));
    }

    #[test]
    fn test_mirror_copy_then_resolve() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let mirror = tmp.path().join("mirror");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("readme.md"), "# Hello").unwrap();
        mirror_service::copy_to_staging(&source, &mirror).unwrap();
        assert!(mirror.join("readme.md").exists());
    }

    #[test]
    fn test_sync_up_no_git_returns_not_initialized() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("readme.md"), "hello").unwrap();

        let mirror = tmp.path().join("mirror");
        let ds = make_doc_set(
            Strategy::Mirrored,
            source.to_str().unwrap(),
            Some(mirror.to_string_lossy().into()),
        );
        let provider = crate::providers::git_provider::GitProvider::new(
            "fake".into(),
            "user".into(),
            "https://github.com/user/repo.git".into(),
            "main".into(),
        );
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(execute_sync_up(&ds, &provider, None));
        assert!(result.is_err());
    }
}
