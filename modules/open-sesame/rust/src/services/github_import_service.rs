use crate::db::{account_repo, doc_set_repo, workspace_repo};
use crate::error::{AppError, AppResult};
use crate::models::account::ProviderType;
use crate::models::doc_set::{DocSet, DocSetStatus, ImportGithubDocSetInput, Strategy};
use crate::providers::git_provider::GitProvider;
use crate::providers::SyncProvider;
use crate::services::doc_set_manifest_service;
use crate::services::github_sync_setup_service;
use crate::utils::{paths, secret_store};
use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Deserialize)]
struct ImportedManifest {
    name: Option<String>,
}

pub async fn import_from_github(
    db: Arc<Mutex<Connection>>,
    input: ImportGithubDocSetInput,
) -> AppResult<DocSet> {
    github_sync_setup_service::validate_remote_url(&input.remote_url)?;

    let (account_username, token) = {
        let db = db.lock().await;
        workspace_repo::find_by_id(&db, &input.workspace_id)?
            .ok_or_else(|| AppError::NotFound("Workspace".into()))?;

        let account = account_repo::find_by_id(&db, &input.account_id)?
            .ok_or_else(|| AppError::NotFound("Account".into()))?;
        let token = secret_store::resolve_token(&account.token)?;
        (account.username, token)
    };

    let id = uuid::Uuid::new_v4().to_string();
    let mirror_path = paths::mirror_path(&id)?;
    let provider = GitProvider::new(
        token,
        account_username,
        input.remote_url.clone(),
        "main".into(),
    );

    provider.init_local(&mirror_path).await?;
    provider.force_pull(&mirror_path).await?;

    let display_name = input
        .display_name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| {
            read_manifest_name(&mirror_path)
                .unwrap_or_else(|| repo_name_from_url(&input.remote_url))
        });

    let now = chrono::Utc::now();
    let mirror_path_str = mirror_path.to_string_lossy().to_string();
    let doc_set = DocSet {
        id,
        workspace_id: input.workspace_id,
        account_id: input.account_id,
        display_name,
        source_path: mirror_path_str.clone(),
        strategy: Strategy::Mirrored,
        mirror_path: Some(mirror_path_str),
        provider_type: ProviderType::Github,
        remote_url: Some(input.remote_url),
        remote_id: None,
        branch: "main".into(),
        auto_sync: false,
        last_synced_at: Some(now),
        last_commit: current_head_commit(&mirror_path),
        status: DocSetStatus::Idle,
        has_mapping: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    let db = db.lock().await;
    doc_set_manifest_service::write_manifest(&doc_set)?;
    doc_set_repo::insert(&db, &doc_set)?;
    Ok(doc_set)
}

fn read_manifest_name(mirror_path: &Path) -> Option<String> {
    let path = mirror_path.join(".open-sesame/doc-set.json");
    let content = fs::read_to_string(path).ok()?;
    let manifest = serde_json::from_str::<ImportedManifest>(&content).ok()?;
    manifest.name
}

fn repo_name_from_url(remote_url: &str) -> String {
    remote_url
        .trim_end_matches(".git")
        .rsplit(['/', ':'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("Imported Docs")
        .to_string()
}

fn current_head_commit(staging_path: &Path) -> Option<String> {
    let repo = git2::Repository::open(staging_path).ok()?;
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    Some(commit.id().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repo_name_from_url() {
        assert_eq!(
            repo_name_from_url("https://github.com/user/docs.git"),
            "docs"
        );
        assert_eq!(
            repo_name_from_url("git@github.com:user/project-docs.git"),
            "project-docs"
        );
    }
}
