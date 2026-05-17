use crate::error::{AppError, AppResult};
use std::path::Path;

use super::storage::{
    read_device_mapping_from_mirror, read_manifest_from_mirror, write_device_mapping_to_mirror,
    write_manifest_to_mirror,
};

pub(super) fn ensure_path_is_only_new_in_git(
    mirror: &Path,
    relative_mirror: &str,
) -> AppResult<()> {
    let repo = git2::Repository::open(mirror)?;
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    let prefix = format!("{relative_mirror}/");
    let mut matched = false;

    for entry in statuses.iter() {
        let Some(path) = entry.path().map(|path| path.replace('\\', "/")) else {
            continue;
        };
        if path != relative_mirror && !path.starts_with(&prefix) {
            continue;
        }
        matched = true;
        let status = entry.status();
        if !(status.is_wt_new() || status.is_index_new()) {
            return Err(AppError::Validation(
                "Only new, untracked mirror files can be removed from this screen.".into(),
            ));
        }
    }

    if !matched {
        return Err(AppError::Validation(
            "This path is already tracked by git, so it cannot be removed as a new mirror item."
                .into(),
        ));
    }

    Ok(())
}

pub(super) fn remove_manifest_entries_under_path(
    mirror: &Path,
    relative_mirror: &str,
) -> AppResult<()> {
    let mut manifest = read_manifest_from_mirror(mirror)?;
    let prefix = format!("{relative_mirror}/");
    let removed_source_ids: Vec<String> = manifest
        .sources
        .iter()
        .filter(|source| {
            source.mirror_path == relative_mirror || source.mirror_path.starts_with(&prefix)
        })
        .map(|source| source.id.clone())
        .collect();

    if removed_source_ids.is_empty() {
        return Ok(());
    }

    manifest
        .sources
        .retain(|source| !removed_source_ids.iter().any(|id| id == &source.id));
    write_manifest_to_mirror(mirror, &manifest)?;

    let mut mappings = read_device_mapping_from_mirror(mirror).unwrap_or_default();
    mappings
        .mappings
        .retain(|mapping| !removed_source_ids.iter().any(|id| id == &mapping.source_id));
    write_device_mapping_to_mirror(mirror, &mappings)?;
    Ok(())
}
