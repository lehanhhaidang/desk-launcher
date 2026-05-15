use crate::error::AppResult;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug)]
pub struct SearchResult {
    pub file_path: String,
    pub file_name: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Serialize, Debug)]
pub struct SearchMatch {
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Serialize, Debug)]
pub struct FileNameResult {
    pub file_path: String,
    pub file_name: String,
    pub is_dir: bool,
}

/// Tìm kiếm nội dung trong tất cả text files
pub fn search_content(
    root: &Path,
    query: &str,
    max_results: usize,
) -> AppResult<Vec<SearchResult>> {
    if query.is_empty() {
        return Ok(vec![]);
    }
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(root, root, &query_lower, &mut results, max_results)?;
    Ok(results)
}

fn search_recursive(
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<SearchResult>,
    max_results: usize,
) -> AppResult<()> {
    if results.len() >= max_results {
        return Ok(());
    }

    if current.is_dir() {
        let name = current
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if should_skip_dir(&name) {
            return Ok(());
        }
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            search_recursive(root, &entry.path(), query, results, max_results)?;
        }
    } else if is_searchable_file(current) {
        if let Ok(content) = fs::read_to_string(current) {
            let mut matches = Vec::new();
            for (line_num, line) in content.lines().enumerate() {
                let line_lower = line.to_lowercase();
                let mut start = 0;
                while let Some(pos) = line_lower[start..].find(query) {
                    let abs_pos = start + pos;
                    matches.push(SearchMatch {
                        line_number: line_num + 1,
                        line_content: line.to_string(),
                        match_start: abs_pos,
                        match_end: abs_pos + query.len(),
                    });
                    start = abs_pos + query.len();
                }
            }
            if !matches.is_empty() {
                let relative = current
                    .strip_prefix(root)
                    .unwrap_or(current)
                    .to_string_lossy()
                    .replace('\\', "/");
                results.push(SearchResult {
                    file_path: relative,
                    file_name: current
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    matches,
                });
            }
        }
    }
    Ok(())
}

/// Tìm kiếm theo tên file
pub fn search_filenames(
    root: &Path,
    query: &str,
    max_results: usize,
) -> AppResult<Vec<FileNameResult>> {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_filenames_recursive(root, root, &query_lower, &mut results, max_results)?;
    results.sort_by(|a, b| {
        filename_match_score(&a.file_name, &query_lower)
            .cmp(&filename_match_score(&b.file_name, &query_lower))
    });
    Ok(results)
}

fn search_filenames_recursive(
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<FileNameResult>,
    max_results: usize,
) -> AppResult<()> {
    if results.len() >= max_results {
        return Ok(());
    }
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_dir(&name) {
            continue;
        }
        if name.to_lowercase().contains(query) {
            let relative = entry
                .path()
                .strip_prefix(root)
                .unwrap_or(&entry.path())
                .to_string_lossy()
                .replace('\\', "/");
            results.push(FileNameResult {
                file_path: relative,
                file_name: name.clone(),
                is_dir: entry.path().is_dir(),
            });
        }
        if entry.path().is_dir() && results.len() < max_results {
            search_filenames_recursive(root, &entry.path(), query, results, max_results)?;
        }
    }
    Ok(())
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | ".DS_Store" | "target" | "__pycache__"
    )
}

fn is_searchable_file(path: &Path) -> bool {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase());
    match ext.as_deref() {
        Some(
            "md" | "txt" | "rs" | "ts" | "tsx" | "js" | "jsx" | "json" | "yaml" | "yml" | "toml"
            | "py" | "go" | "html" | "css" | "sh" | "bash" | "cfg" | "ini" | "xml" | "svg" | "sql",
        ) => true,
        None => {
            let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase());
            matches!(
                name.as_deref(),
                Some("readme" | "license" | "makefile" | "dockerfile")
            )
        }
        _ => false,
    }
}

fn filename_match_score(name: &str, query: &str) -> u32 {
    let name_lower = name.to_lowercase();
    if name_lower == query {
        0
    } else if name_lower.starts_with(query) {
        1
    } else {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_searchable_files(root: &Path) {
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::write(
            root.join("readme.md"),
            "# Getting Started\n\nWelcome to the project.\nThis is a guide.",
        )
        .unwrap();
        fs::write(
            root.join("docs/api.md"),
            "# API Reference\n\n## Authentication\nUse bearer tokens for auth.",
        )
        .unwrap();
        fs::write(
            root.join("docs/deploy.md"),
            "# Deploy Guide\n\nDeploy to production.\nAuthentication required.",
        )
        .unwrap();
        fs::write(root.join("config.json"), "{\"key\": \"value\"}").unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(
            root.join("node_modules/pkg/index.js"),
            "should not search this",
        )
        .unwrap();
    }

    #[test]
    fn test_search_content_finds_matches() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "authentication", 50).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_search_content_case_insensitive() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "AUTHENTICATION", 50).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_search_content_returns_line_info() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "getting started", 50).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].matches[0].line_number, 1);
    }

    #[test]
    fn test_search_skips_node_modules() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "should not search", 50).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_respects_max_results() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "the", 1).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_empty_query() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_content(tmp.path(), "", 50).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_filenames() {
        let tmp = TempDir::new().unwrap();
        create_searchable_files(tmp.path());
        let results = search_filenames(tmp.path(), "api", 50).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name, "api.md");
    }

    #[test]
    fn test_is_searchable_file() {
        assert!(is_searchable_file(Path::new("test.md")));
        assert!(is_searchable_file(Path::new("test.rs")));
        assert!(!is_searchable_file(Path::new("test.png")));
        assert!(!is_searchable_file(Path::new("test.exe")));
    }
}
