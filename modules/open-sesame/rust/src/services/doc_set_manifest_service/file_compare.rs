use crate::error::AppResult;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::models::MappingPreflightSample;

pub(super) fn collect_file_hashes(root: &Path) -> AppResult<HashMap<String, String>> {
    let mut files = HashMap::new();
    if !root.exists() {
        return Ok(files);
    }
    if root.is_file() {
        let name = root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into());
        files.insert(name, hash_file(root)?);
        return Ok(files);
    }

    collect_file_hashes_recursive(root, root, &mut files)?;
    Ok(files)
}

pub(super) fn collect_file_paths(root: &Path) -> AppResult<HashMap<String, PathBuf>> {
    let mut files = HashMap::new();
    if !root.exists() {
        return Ok(files);
    }
    if root.is_file() {
        let name = root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into());
        files.insert(name, root.to_path_buf());
        return Ok(files);
    }

    collect_file_paths_recursive(root, root, &mut files)?;
    Ok(files)
}

fn collect_file_paths_recursive(
    root: &Path,
    current: &Path,
    files: &mut HashMap<String, PathBuf>,
) -> AppResult<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if should_skip_preflight_entry(&name) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_file_paths_recursive(root, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, path);
        }
    }
    Ok(())
}

pub(super) fn unique_local_copy_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_string());
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();

    for index in 1.. {
        let suffix = if index == 1 {
            "local-copy".to_string()
        } else {
            format!("local-copy-{index}")
        };
        let file_name = match &extension {
            Some(extension) => format!("{stem}.{suffix}.{extension}"),
            None => format!("{stem}.{suffix}"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!()
}

fn collect_file_hashes_recursive(
    root: &Path,
    current: &Path,
    files: &mut HashMap<String, String>,
) -> AppResult<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if should_skip_preflight_entry(&name) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_file_hashes_recursive(root, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, hash_file(&path)?);
        }
    }
    Ok(())
}

fn hash_file(path: &Path) -> AppResult<String> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn should_skip_preflight_entry(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".open-sesame" | ".DS_Store" | "Thumbs.db" | "node_modules"
    )
}

pub(super) fn push_preflight_sample(
    samples: &mut Vec<MappingPreflightSample>,
    path: String,
    kind: &str,
) {
    if samples.len() >= 100 {
        return;
    }
    samples.push(MappingPreflightSample {
        path,
        kind: kind.into(),
    });
}
