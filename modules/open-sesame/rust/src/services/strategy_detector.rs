use crate::error::AppResult;
use crate::models::doc_set::Strategy;
use std::path::Path;

/// Kết quả detection
#[derive(Debug)]
pub struct DetectionResult {
    pub strategy: Strategy,
    pub parent_repo_path: Option<String>,
    pub reason: String,
}

/// Detect strategy cho folder tại `source_path`
pub fn detect(source_path: &Path) -> AppResult<DetectionResult> {
    if !source_path.exists() {
        return Err(crate::error::AppError::Validation(format!(
            "Path does not exist: {}",
            source_path.display()
        )));
    }

    if !source_path.is_dir() {
        return Err(crate::error::AppError::Validation(
            "Path must be a directory".into(),
        ));
    }

    // Case 1: Folder chính nó là root của một git repo
    let own_git = source_path.join(".git");
    if own_git.exists() {
        return Ok(DetectionResult {
            strategy: Strategy::Standalone,
            parent_repo_path: Some(source_path.to_string_lossy().into()),
            reason: "Folder is a git repository root".into(),
        });
    }

    // Case 2: Check parent directories cho .git
    let mut current = source_path.parent();
    while let Some(dir) = current {
        let git_dir = dir.join(".git");
        if git_dir.exists() {
            // .git có thể là folder (normal repo) hoặc file (submodule)
            return Ok(DetectionResult {
                strategy: Strategy::Mirrored,
                parent_repo_path: Some(dir.to_string_lossy().into()),
                reason: format!("Folder is inside git repo at: {}", dir.display()),
            });
        }
        current = dir.parent();
    }

    // Case 3: Không nằm trong git repo nào
    Ok(DetectionResult {
        strategy: Strategy::Standalone,
        parent_repo_path: None,
        reason: "Folder is not inside any git repository".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_detect_standalone_no_git() {
        let tmp = TempDir::new().unwrap();
        let docs = tmp.path().join("my-docs");
        fs::create_dir(&docs).unwrap();

        let result = detect(&docs).unwrap();
        if let Some(parent_repo_path) = result.parent_repo_path {
            assert_eq!(result.strategy, Strategy::Mirrored);
            assert!(Path::new(&parent_repo_path).join(".git").exists());
        } else {
            assert_eq!(result.strategy, Strategy::Standalone);
        }
    }

    #[test]
    fn test_detect_standalone_is_git_root() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("my-repo");
        fs::create_dir(&repo).unwrap();
        fs::create_dir(repo.join(".git")).unwrap();

        let result = detect(&repo).unwrap();
        assert_eq!(result.strategy, Strategy::Standalone);
        assert!(result.parent_repo_path.is_some());
    }

    #[test]
    fn test_detect_mirrored_inside_repo() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("project");
        let docs = repo.join("docs");
        fs::create_dir_all(&docs).unwrap();
        fs::create_dir(repo.join(".git")).unwrap();

        let result = detect(&docs).unwrap();
        assert_eq!(result.strategy, Strategy::Mirrored);
        assert_eq!(
            result.parent_repo_path.unwrap(),
            repo.to_string_lossy().to_string()
        );
    }

    #[test]
    fn test_detect_mirrored_nested_deep() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("project");
        let docs = repo.join("src").join("modules").join("docs");
        fs::create_dir_all(&docs).unwrap();
        fs::create_dir(repo.join(".git")).unwrap();

        let result = detect(&docs).unwrap();
        assert_eq!(result.strategy, Strategy::Mirrored);
    }

    #[test]
    fn test_detect_submodule_git_file() {
        let tmp = TempDir::new().unwrap();
        let parent = tmp.path().join("parent");
        let sub = parent.join("submodule");
        let docs = sub.join("docs");
        fs::create_dir_all(&docs).unwrap();
        // Submodule: .git is a FILE, not a directory
        fs::write(sub.join(".git"), "gitdir: ../../.git/modules/sub").unwrap();
        fs::create_dir(parent.join(".git")).unwrap();

        let result = detect(&docs).unwrap();
        assert_eq!(result.strategy, Strategy::Mirrored);
    }

    #[test]
    fn test_detect_nonexistent_path() {
        let result = detect(Path::new("/nonexistent/path/abc123"));
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_file_not_directory() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("file.txt");
        fs::write(&file, "content").unwrap();

        let result = detect(&file);
        assert!(result.is_err());
    }
}
