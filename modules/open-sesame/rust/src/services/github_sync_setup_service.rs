use crate::db::{account_repo, doc_set_repo};
use crate::error::{AppError, AppResult};
use crate::models::account::ProviderType;
use crate::models::doc_set::{DocSet, GithubRemoteMode, SetupGithubRemoteInput};
use crate::providers::git_provider::GitProvider;
use crate::providers::SyncProvider;
use crate::services::doc_set_manifest_service;
use crate::services::repo_service;
use crate::services::sync_service;
use crate::utils::secret_store;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

pub async fn setup_github_remote(
    db: Arc<Mutex<Connection>>,
    input: SetupGithubRemoteInput,
) -> AppResult<DocSet> {
    let (doc_set, account, token) = {
        let db = db.lock().await;
        let doc_set = doc_set_repo::find_by_id(&db, &input.doc_set_id)?
            .ok_or_else(|| AppError::NotFound("Doc set".into()))?;

        if doc_set.provider_type != ProviderType::Github {
            return Err(AppError::Provider(
                "Only GitHub doc sets can use GitHub setup".into(),
            ));
        }

        let account = account_repo::find_by_id(&db, &doc_set.account_id)?
            .ok_or_else(|| AppError::NotFound(format!("Account {}", doc_set.account_id)))?;
        let token = secret_store::resolve_token(&account.token)?;
        (doc_set, account, token)
    };

    let remote_url = match input.mode {
        GithubRemoteMode::Create => {
            let repo_name = input
                .repo_name
                .as_deref()
                .map(normalize_repo_name)
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| normalize_repo_name(&doc_set.display_name));

            if repo_name.is_empty() {
                return Err(AppError::Validation(
                    "Repository name cannot be empty".into(),
                ));
            }

            let repo = repo_service::create_github_repo(
                &token,
                &repo_name,
                "Managed by Open Sesame",
                input.private,
            )
            .await?;
            repo.clone_url
        }
        GithubRemoteMode::Link => {
            let remote_url = input
                .remote_url
                .as_deref()
                .map(str::trim)
                .filter(|url| !url.is_empty())
                .ok_or_else(|| AppError::Validation("Remote URL is required".into()))?;
            validate_remote_url(remote_url)?;
            remote_url.to_string()
        }
    };

    let staging_path = sync_service::resolve_staging_path(&doc_set)?;
    let provider = GitProvider::new(
        token,
        account.username,
        remote_url.clone(),
        doc_set.branch.clone(),
    );
    provider.init_local(Path::new(&staging_path)).await?;

    let db = db.lock().await;
    doc_set_repo::update_remote(&db, &doc_set.id, &remote_url, &doc_set.branch)?;
    let updated = doc_set_repo::find_by_id(&db, &doc_set.id)?
        .ok_or_else(|| AppError::NotFound("Doc set".into()))?;
    doc_set_manifest_service::write_manifest(&updated)?;
    Ok(updated)
}

fn normalize_repo_name(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn validate_remote_url(url: &str) -> AppResult<()> {
    let is_https_git = url.starts_with("https://github.com/") && url.ends_with(".git");
    let is_ssh_git = url.starts_with("git@github.com:") && url.ends_with(".git");

    if is_https_git || is_ssh_git {
        Ok(())
    } else {
        Err(AppError::Validation(
            "Remote URL must be a GitHub .git URL".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_repo_name() {
        assert_eq!(normalize_repo_name("My Docs!"), "my-docs");
        assert_eq!(normalize_repo_name(" API__Docs "), "api__docs");
    }

    #[test]
    fn test_validate_remote_url() {
        assert!(validate_remote_url("https://github.com/user/repo.git").is_ok());
        assert!(validate_remote_url("git@github.com:user/repo.git").is_ok());
        assert!(validate_remote_url("https://example.com/user/repo.git").is_err());
    }
}
