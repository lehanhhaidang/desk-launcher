use super::{PullResult, SyncProvider, SyncStatus};
use crate::error::AppResult;
use crate::services::repo_service;
use async_trait::async_trait;
use git2::{
    BranchType, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks, Repository,
    Signature, StatusOptions,
};
use std::{fs, path::Path};

pub struct GitProvider {
    token: String,
    #[allow(dead_code)]
    username: String,
    remote_url: String,
    branch: String,
}

impl GitProvider {
    pub fn new(token: String, username: String, remote_url: String, branch: String) -> Self {
        Self {
            token,
            username,
            remote_url,
            branch,
        }
    }

    fn callbacks(&self) -> RemoteCallbacks<'_> {
        let mut callbacks = RemoteCallbacks::new();
        let token = self.token.clone();
        callbacks.credentials(move |_url, _username, _allowed| {
            Cred::userpass_plaintext("x-access-token", &token)
        });
        callbacks
    }

    fn commit_index(&self, repo: &Repository, message: Option<&str>) -> AppResult<String> {
        ensure_internal_metadata_excluded(repo)?;
        remove_generated_worktree_gitignore(repo)?;
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.remove_all([".open-sesame", ".open-sesame/**"].iter(), None)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        if let Some(parent_commit) = &parent {
            if parent_commit.tree_id() == tree_id {
                return Ok(parent_commit.id().to_string());
            }
        } else if index.is_empty() {
            return Ok(String::new());
        }

        let utc7 = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
        let now = chrono::Utc::now().with_timezone(&utc7);
        let git_time = git2::Time::new(now.timestamp(), 7 * 60); // offset in minutes
        let sig = Signature::new("Open Sesame", "opensesame@local", &git_time)?;
        let default_msg = format!("sync: {}", now.format("%Y-%m-%d %H:%M:%S"));
        let msg = message.unwrap_or(&default_msg);
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        let commit_id = repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)?;

        Ok(commit_id.to_string())
    }

    fn force_checkout_fetch_head(&self, repo: &Repository) -> AppResult<()> {
        let fetch_head = repo.find_reference("FETCH_HEAD")?;
        let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;
        let refname = format!("refs/heads/{}", self.branch);

        if let Ok(mut reference) = repo.find_reference(&refname) {
            reference.set_target(fetch_commit.id(), "Force pull")?;
        } else {
            repo.reference(&refname, fetch_commit.id(), true, "Force pull")?;
        }
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
        Ok(())
    }
}

#[async_trait]
impl SyncProvider for GitProvider {
    async fn init_local(&self, staging_path: &Path) -> AppResult<()> {
        let repo = if staging_path.join(".git").exists() {
            Repository::open(staging_path)?
        } else {
            Repository::init(staging_path)?
        };

        match repo.find_remote("origin") {
            Ok(_) => repo.remote_set_url("origin", &self.remote_url)?,
            Err(_) => {
                repo.remote("origin", &self.remote_url)?;
            }
        }

        if repo.head().is_err() && repo.find_branch(&self.branch, BranchType::Local).is_err() {
            repo.set_head(&format!("refs/heads/{}", self.branch))?;
        }

        ensure_internal_metadata_excluded(&repo)?;
        Ok(())
    }

    async fn init_remote(&self, name: &str, private: bool) -> AppResult<String> {
        let repo =
            repo_service::create_github_repo(&self.token, name, "Managed by Open Sesame", private)
                .await?;
        Ok(repo.clone_url)
    }

    async fn push(&self, staging_path: &Path, message: Option<&str>) -> AppResult<String> {
        let repo = Repository::open(staging_path)?;
        let commit_id = self.commit_index(&repo, message)?;
        if commit_id.is_empty() {
            return Ok(commit_id);
        }

        // git push — check if remote branch exists to decide refspec
        let mut remote = repo.find_remote("origin")?;

        // Fetch remote refs to check if branch exists
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.callbacks());
        remote.fetch(&[&self.branch], Some(&mut fetch_opts), None).ok();

        // Check if remote branch already has commits
        let remote_ref = format!("refs/remotes/origin/{}", self.branch);
        let remote_branch_exists = repo.find_reference(&remote_ref).is_ok();

        let refspec = if remote_branch_exists {
            // Normal push (non-force) — remote already has commits
            format!("refs/heads/{}", self.branch)
        } else {
            // First push to empty repo — use force refspec to create branch
            format!("+refs/heads/{}", self.branch)
        };

        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(self.callbacks());

        match remote.push(&[&refspec], Some(&mut push_opts)) {
            Ok(()) => Ok(commit_id.to_string()),
            Err(e) if e.code() == git2::ErrorCode::NotFastForward => {
                Err(crate::error::AppError::Sync(
                    "Remote has newer commits. Pull first, then push again.".into(),
                ))
            }
            Err(e) => Err(crate::error::AppError::Git(e)),
        }
    }

    async fn force_push(&self, staging_path: &Path, message: Option<&str>) -> AppResult<String> {
        let repo = Repository::open(staging_path)?;
        let commit_id = self.commit_index(&repo, message)?;
        if commit_id.is_empty() {
            return Ok(commit_id);
        }

        let mut remote = repo.find_remote("origin")?;
        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(self.callbacks());
        remote.push(
            &[&format!("+refs/heads/{}:refs/heads/{}", self.branch, self.branch)],
            Some(&mut push_opts),
        )?;

        Ok(commit_id)
    }

    async fn pull(&self, staging_path: &Path) -> AppResult<PullResult> {
        let repo = Repository::open(staging_path)?;

        // git fetch
        let mut remote = repo.find_remote("origin")?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.callbacks());
        remote.fetch(&[&self.branch], Some(&mut fetch_opts), None)?;

        let fetch_head = repo.find_reference("FETCH_HEAD")?;
        let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;

        let (analysis, _) = repo.merge_analysis(&[&fetch_commit])?;

        if analysis.is_up_to_date() {
            return Ok(PullResult {
                updated_files: vec![],
                conflicted_files: vec![],
            });
        }

        if analysis.is_unborn() {
            let refname = format!("refs/heads/{}", self.branch);
            repo.reference(&refname, fetch_commit.id(), true, "Initial pull")?;
            repo.set_head(&refname)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
            return Ok(PullResult {
                updated_files: vec![],
                conflicted_files: vec![],
            });
        }

        if analysis.is_fast_forward() {
            let refname = format!("refs/heads/{}", self.branch);
            if let Ok(mut reference) = repo.find_reference(&refname) {
                reference.set_target(fetch_commit.id(), "Fast-forward")?;
            } else {
                repo.reference(&refname, fetch_commit.id(), true, "Fast-forward")?;
            }
            repo.set_head(&refname)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
            return Ok(PullResult {
                updated_files: vec![],
                conflicted_files: vec![],
            });
        }

        Err(crate::error::AppError::Sync(
            "Conflict: remote and local have diverged. Please resolve manually.".into(),
        ))
    }

    async fn force_pull(&self, staging_path: &Path) -> AppResult<PullResult> {
        let repo = Repository::open(staging_path)?;
        let mut remote = repo.find_remote("origin")?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.callbacks());
        remote.fetch(&[&self.branch], Some(&mut fetch_opts), None)?;
        self.force_checkout_fetch_head(&repo)?;

        Ok(PullResult {
            updated_files: vec![],
            conflicted_files: vec![],
        })
    }

    async fn status(&self, staging_path: &Path) -> AppResult<SyncStatus> {
        let repo = Repository::open(staging_path)?;
        ensure_internal_metadata_excluded(&repo)?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        if statuses.is_empty() {
            return Ok(SyncStatus::UpToDate);
        }

        let changed: Vec<String> = statuses
            .iter()
            .filter_map(|s| s.path().map(|p| p.to_string()))
            .filter(|path| !is_internal_metadata_path(path))
            .collect();

        if changed.is_empty() {
            return Ok(SyncStatus::UpToDate);
        }

        Ok(SyncStatus::LocalChanges {
            changed_files: changed,
        })
    }

    fn provider_name(&self) -> &str {
        "GitHub"
    }
}

fn ensure_internal_metadata_excluded(repo: &Repository) -> AppResult<()> {
    let Some(git_dir) = repo.path().to_str().map(Path::new) else {
        return Ok(());
    };
    let exclude_path = git_dir.join("info/exclude");
    let ignore_line = ".open-sesame/";
    let content = fs::read_to_string(&exclude_path).unwrap_or_default();

    if content.lines().any(|line| line.trim() == ignore_line) {
        return Ok(());
    }

    if let Some(parent) = exclude_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut next = content;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(ignore_line);
    next.push('\n');
    fs::write(exclude_path, next)?;
    Ok(())
}

fn remove_generated_worktree_gitignore(repo: &Repository) -> AppResult<()> {
    let Some(workdir) = repo.workdir() else {
        return Ok(());
    };
    let gitignore_path = workdir.join(".gitignore");
    let ignore_line = ".open-sesame/device.local.json";
    if !gitignore_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&gitignore_path).unwrap_or_default();
    let mut lines: Vec<&str> = content
        .lines()
        .filter(|line| line.trim() != ignore_line)
        .collect();

    if lines.len() == content.lines().count() {
        return Ok(());
    }

    if lines.iter().all(|line| line.trim().is_empty()) {
        fs::remove_file(gitignore_path)?;
        return Ok(());
    }

    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    let mut next = lines.join("\n");
    next.push('\n');
    fs::write(gitignore_path, next)?;
    Ok(())
}

fn is_internal_metadata_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    normalized == ".open-sesame" || normalized.starts_with(".open-sesame/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn temp_dir() -> TempDir {
        let test_root = std::env::current_dir().unwrap().join("target/test-temp");
        fs::create_dir_all(&test_root).unwrap();
        TempDir::new_in(test_root).unwrap()
    }

    #[test]
    fn test_init_local_creates_git_repo() {
        let tmp = temp_dir();
        let path = tmp.path().join("test-repo");
        fs::create_dir(&path).unwrap();

        Repository::init(&path).unwrap();
        assert!(path.join(".git").exists());
    }

    #[test]
    fn test_status_empty_repo() {
        let tmp = temp_dir();
        Repository::init(tmp.path()).unwrap();

        let provider = GitProvider::new("fake".into(), "user".into(), "url".into(), "main".into());

        let rt = tokio::runtime::Runtime::new().unwrap();
        let status = rt.block_on(provider.status(tmp.path())).unwrap();
        assert!(matches!(status, SyncStatus::UpToDate));
    }

    #[test]
    fn test_status_with_untracked_files() {
        let tmp = temp_dir();
        Repository::init(tmp.path()).unwrap();
        fs::write(tmp.path().join("new.md"), "content").unwrap();

        let provider = GitProvider::new("fake".into(), "user".into(), "url".into(), "main".into());

        let rt = tokio::runtime::Runtime::new().unwrap();
        let status = rt.block_on(provider.status(tmp.path())).unwrap();
        match status {
            SyncStatus::LocalChanges { changed_files } => {
                assert!(changed_files.contains(&"new.md".to_string()));
            }
            _ => panic!("Expected LocalChanges"),
        }
    }

    #[test]
    fn test_commit_index_excludes_open_sesame_metadata() {
        let tmp = temp_dir();
        let repo = Repository::init(tmp.path()).unwrap();
        fs::write(tmp.path().join("README.md"), "hello").unwrap();
        fs::create_dir_all(tmp.path().join(".open-sesame")).unwrap();
        fs::write(tmp.path().join(".open-sesame/doc-set.json"), "{}").unwrap();
        fs::write(tmp.path().join(".open-sesame/device.local.json"), "{}").unwrap();
        fs::write(tmp.path().join(".gitignore"), ".open-sesame/device.local.json\n").unwrap();

        let provider = GitProvider::new("fake".into(), "user".into(), "url".into(), "main".into());
        provider.commit_index(&repo, Some("test")).unwrap();

        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let tree = head.tree().unwrap();
        assert!(tree.get_path(Path::new("README.md")).is_ok());
        assert!(tree.get_path(Path::new(".gitignore")).is_err());
        assert!(tree.get_path(Path::new(".open-sesame/doc-set.json")).is_err());
        assert!(tree.get_path(Path::new(".open-sesame/device.local.json")).is_err());
        assert!(!tmp.path().join(".gitignore").exists());
        assert!(fs::read_to_string(tmp.path().join(".git/info/exclude"))
            .unwrap()
            .contains(".open-sesame/"));
    }
}
