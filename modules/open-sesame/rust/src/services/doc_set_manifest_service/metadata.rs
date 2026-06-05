use crate::error::AppResult;
use std::fs;
use std::path::Path;

pub fn ensure_internal_metadata_excluded(mirror: &Path) -> AppResult<()> {
    remove_generated_worktree_gitignore(mirror)?;
    let exclude_path = mirror.join(".git/info/exclude");
    if !exclude_path.exists() {
        return Ok(());
    }

    let ignore_line = ".open-sesame/";
    let content = fs::read_to_string(&exclude_path).unwrap_or_default();
    if content.lines().any(|line| line.trim() == ignore_line) {
        return Ok(());
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

fn remove_generated_worktree_gitignore(mirror: &Path) -> AppResult<()> {
    let gitignore_path = mirror.join(".gitignore");
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
