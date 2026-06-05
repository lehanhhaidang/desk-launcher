use crate::error::AppResult;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub absolute_path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub extension: Option<String>,
    pub git_status: Option<String>,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub size: usize,
    pub truncated: bool,
    pub extension: Option<String>,
}

/// Đọc cây thư mục, giới hạn depth
pub fn read_tree(root: &Path, max_depth: u32) -> AppResult<FileNode> {
    read_tree_with_options(root, max_depth, true)
}

pub fn read_tree_with_options(
    root: &Path,
    max_depth: u32,
    include_git_status: bool,
) -> AppResult<FileNode> {
    if !root.exists() {
        return Err(crate::error::AppError::NotFound(format!(
            "Path not found: {}",
            root.display()
        )));
    }
    let git_statuses = if include_git_status {
        read_git_statuses(root)
    } else {
        HashMap::new()
    };
    build_node(root, root, 0, max_depth, &git_statuses)
}

fn build_node(
    root: &Path,
    current: &Path,
    depth: u32,
    max_depth: u32,
    git_statuses: &HashMap<String, String>,
) -> AppResult<FileNode> {
    let metadata = fs::metadata(current)?;
    let name = current
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| current.to_string_lossy().to_string());

    let relative = current
        .strip_prefix(root)
        .unwrap_or(current)
        .to_string_lossy()
        .replace('\\', "/");

    let modified = metadata.modified().ok().map(|t| {
        let datetime: chrono::DateTime<chrono::Utc> = t.into();
        datetime.to_rfc3339()
    });

    if current.is_dir() {
        let children = if depth < max_depth {
            let mut entries: Vec<FileNode> = fs::read_dir(current)?
                .filter_map(|e| e.ok())
                .filter(|e| !should_ignore(&e.file_name().to_string_lossy()))
                .filter_map(|e| {
                    build_node(root, &e.path(), depth + 1, max_depth, git_statuses).ok()
                })
                .collect();

            add_deleted_children(
                root,
                &relative,
                depth,
                max_depth,
                git_statuses,
                &mut entries,
            );

            entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            });
            Some(entries)
        } else {
            Some(vec![])
        };

        Ok(FileNode {
            name,
            path: relative.clone(),
            absolute_path: current.to_string_lossy().to_string(),
            is_dir: true,
            size: None,
            modified,
            extension: None,
            git_status: git_status_for_path(&relative, true, git_statuses),
            children,
        })
    } else {
        Ok(FileNode {
            name: name.clone(),
            path: relative.clone(),
            absolute_path: current.to_string_lossy().to_string(),
            is_dir: false,
            size: Some(metadata.len()),
            modified,
            extension: Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_string()),
            git_status: git_status_for_path(&relative, false, git_statuses),
            children: None,
        })
    }
}

fn add_deleted_children(
    root: &Path,
    parent_relative: &str,
    depth: u32,
    max_depth: u32,
    git_statuses: &HashMap<String, String>,
    entries: &mut Vec<FileNode>,
) {
    if depth >= max_depth {
        return;
    }

    let prefix = if parent_relative.is_empty() {
        String::new()
    } else {
        format!("{parent_relative}/")
    };
    let existing: HashSet<String> = entries.iter().map(|entry| entry.name.clone()).collect();
    let mut added = HashSet::new();

    for (path, status) in git_statuses {
        if status != "deleted" {
            continue;
        }
        if !prefix.is_empty() && !path.starts_with(&prefix) {
            continue;
        }

        let rest = if prefix.is_empty() {
            path.as_str()
        } else {
            &path[prefix.len()..]
        };
        if rest.is_empty() {
            continue;
        }

        let Some(name) = rest.split('/').next() else {
            continue;
        };
        if existing.contains(name) || !added.insert(name.to_string()) {
            continue;
        }

        let child_relative = if parent_relative.is_empty() {
            name.to_string()
        } else {
            format!("{parent_relative}/{name}")
        };
        let has_nested_deleted = git_statuses.iter().any(|(candidate, candidate_status)| {
            candidate_status == "deleted" && candidate.starts_with(&format!("{child_relative}/"))
        });
        let is_dir = rest.contains('/') || has_nested_deleted;
        let mut children = if is_dir { Some(Vec::new()) } else { None };
        if let Some(child_entries) = children.as_mut() {
            add_deleted_children(
                root,
                &child_relative,
                depth + 1,
                max_depth,
                git_statuses,
                child_entries,
            );
        }

        entries.push(FileNode {
            name: name.to_string(),
            path: child_relative.clone(),
            absolute_path: root.join(&child_relative).to_string_lossy().to_string(),
            is_dir,
            size: None,
            modified: None,
            extension: if is_dir {
                None
            } else {
                Path::new(name)
                    .extension()
                    .map(|e| e.to_string_lossy().to_string())
            },
            git_status: Some("deleted".into()),
            children,
        });
    }
}

fn read_git_statuses(root: &Path) -> HashMap<String, String> {
    let Ok(repo) = git2::Repository::discover(root) else {
        return HashMap::new();
    };
    let Some(workdir) = repo.workdir() else {
        return HashMap::new();
    };
    if root.strip_prefix(workdir).is_err() {
        return HashMap::new();
    }

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false);

    let Ok(statuses) = repo.statuses(Some(&mut opts)) else {
        return HashMap::new();
    };

    statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.replace('\\', "/");
            if path == ".open-sesame" || path.starts_with(".open-sesame/") {
                return None;
            }
            let status = normalize_git_status(entry.status())?;
            let relative = Path::new(&path)
                .strip_prefix(root.strip_prefix(workdir).ok()?)
                .ok()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or(path);
            Some((relative, status))
        })
        .filter(|(path, _)| !path.is_empty() && path != ".")
        .collect()
}

fn normalize_git_status(status: git2::Status) -> Option<String> {
    if status.is_conflicted() {
        return Some("conflicted".into());
    }
    if status.is_wt_new() || status.is_index_new() {
        return Some("untracked".into());
    }
    if status.is_wt_deleted() || status.is_index_deleted() {
        return Some("deleted".into());
    }
    if status.is_wt_renamed() || status.is_index_renamed() {
        return Some("renamed".into());
    }
    if status.is_wt_modified()
        || status.is_index_modified()
        || status.is_wt_typechange()
        || status.is_index_typechange()
    {
        return Some("modified".into());
    }
    None
}

fn git_status_for_path(
    relative: &str,
    is_dir: bool,
    git_statuses: &HashMap<String, String>,
) -> Option<String> {
    if relative.is_empty() {
        return folder_status(relative, git_statuses);
    }
    if let Some(status) = git_statuses.get(relative) {
        return Some(status.clone());
    }
    if is_dir {
        return folder_status(relative, git_statuses);
    }
    None
}

fn folder_status(relative: &str, git_statuses: &HashMap<String, String>) -> Option<String> {
    let prefix = if relative.is_empty() {
        String::new()
    } else {
        format!("{relative}/")
    };
    let mut has_modified = false;

    for (path, status) in git_statuses {
        if !prefix.is_empty() && !path.starts_with(&prefix) {
            continue;
        }
        match status.as_str() {
            "conflicted" => return Some("conflicted".into()),
            "deleted" | "modified" | "renamed" => has_modified = true,
            "untracked" if !has_modified => return Some("untracked".into()),
            _ => {}
        }
    }

    if has_modified {
        Some("modified".into())
    } else {
        None
    }
}

fn should_ignore(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".DS_Store" | "node_modules" | "Thumbs.db" | ".open-sesame" | ".gitkeep"
    ) || name.starts_with(".~")
}

/// Đọc nội dung file (cho preview)
pub fn read_file_content(path: &Path, max_bytes: usize) -> AppResult<FileContent> {
    if !path.exists() {
        return Err(crate::error::AppError::NotFound(format!(
            "File not found: {}",
            path.display()
        )));
    }

    let metadata = fs::metadata(path)?;
    let size = metadata.len() as usize;
    let truncated = size > max_bytes;

    let content = if truncated {
        let bytes = fs::read(path)?;
        String::from_utf8_lossy(&bytes[..max_bytes]).to_string()
    } else {
        fs::read_to_string(path)
            .map_err(|_| crate::error::AppError::Internal("File is not valid UTF-8 text".into()))?
    };

    let extension = path.extension().map(|e| e.to_string_lossy().to_string());

    Ok(FileContent {
        content,
        size,
        truncated,
        extension,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_sample_tree(root: &Path) {
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("readme.md"), "# Hello").unwrap();
        fs::write(root.join("docs/guide.md"), "# Guide").unwrap();
        fs::write(root.join("docs/api.md"), "# API").unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
    }

    fn commit_all(repo: &git2::Repository, message: &str) {
        let mut index = repo.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Open Sesame Test", "test@open-sesame.local").unwrap();
        let parents = match repo.head() {
            Ok(head) => vec![head.peel_to_commit().unwrap()],
            Err(_) => vec![],
        };
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .unwrap();
    }

    #[test]
    fn test_read_tree_basic_structure() {
        let tmp = TempDir::new().unwrap();
        create_sample_tree(tmp.path());
        let tree = read_tree(tmp.path(), 3).unwrap();
        assert!(tree.is_dir);
        let children = tree.children.unwrap();
        let names: Vec<&str> = children.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"docs"));
        assert!(names.contains(&"src"));
        assert!(names.contains(&"readme.md"));
        assert!(!names.contains(&".git"));
        assert!(!names.contains(&"node_modules"));
    }

    #[test]
    fn test_read_tree_folders_sorted_first() {
        let tmp = TempDir::new().unwrap();
        create_sample_tree(tmp.path());
        let tree = read_tree(tmp.path(), 3).unwrap();
        let children = tree.children.unwrap();
        let first_file_idx = children.iter().position(|c| !c.is_dir).unwrap();
        let last_dir_idx = children.iter().rposition(|c| c.is_dir).unwrap();
        assert!(last_dir_idx < first_file_idx);
    }

    #[test]
    fn test_read_tree_max_depth_limits() {
        let tmp = TempDir::new().unwrap();
        create_sample_tree(tmp.path());
        let tree = read_tree(tmp.path(), 0).unwrap();
        let children = tree.children.unwrap();
        assert!(children.is_empty());
    }

    #[test]
    fn test_read_file_content_normal() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("test.md"), "# Hello World").unwrap();
        let content = read_file_content(&tmp.path().join("test.md"), 1_000_000).unwrap();
        assert_eq!(content.content, "# Hello World");
        assert!(!content.truncated);
        assert_eq!(content.extension, Some("md".into()));
    }

    #[test]
    fn test_read_file_content_truncated() {
        let tmp = TempDir::new().unwrap();
        let large_content = "a".repeat(1000);
        fs::write(tmp.path().join("large.txt"), &large_content).unwrap();
        let content = read_file_content(&tmp.path().join("large.txt"), 100).unwrap();
        assert_eq!(content.content.len(), 100);
        assert!(content.truncated);
    }

    #[test]
    fn test_read_file_not_found() {
        let result = read_file_content(Path::new("/nonexistent/file.md"), 1000);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_tree_includes_git_statuses_and_deleted_files() {
        let test_root = std::env::current_dir().unwrap().join("target/test-temp");
        fs::create_dir_all(&test_root).unwrap();
        let tmp = TempDir::new_in(test_root).unwrap();
        let repo = git2::Repository::init(tmp.path()).unwrap();
        fs::create_dir_all(tmp.path().join("docs")).unwrap();
        fs::write(tmp.path().join("docs/guide.md"), "# Guide").unwrap();
        fs::write(tmp.path().join("README.md"), "# Readme").unwrap();
        commit_all(&repo, "initial");

        fs::write(tmp.path().join("README.md"), "# Changed").unwrap();
        fs::remove_file(tmp.path().join("docs/guide.md")).unwrap();
        fs::write(tmp.path().join("new.md"), "# New").unwrap();

        let tree = read_tree_with_options(tmp.path(), 2, true).unwrap();
        let children = tree.children.unwrap();
        let readme = children
            .iter()
            .find(|node| node.name == "README.md")
            .unwrap();
        let new_file = children.iter().find(|node| node.name == "new.md").unwrap();
        let docs = children.iter().find(|node| node.name == "docs").unwrap();
        let deleted = docs
            .children
            .as_ref()
            .unwrap()
            .iter()
            .find(|node| node.name == "guide.md")
            .unwrap();

        assert_eq!(readme.git_status.as_deref(), Some("modified"));
        assert_eq!(new_file.git_status.as_deref(), Some("untracked"));
        assert_eq!(docs.git_status.as_deref(), Some("modified"));
        assert_eq!(deleted.git_status.as_deref(), Some("deleted"));
    }
}
