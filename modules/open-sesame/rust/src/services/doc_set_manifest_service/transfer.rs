use crate::error::AppResult;
use crate::models::doc_set::DocSet;
use crate::services::mirror_service;
use std::path::Path;

use super::models::SyncDirection;
use super::storage::{mirror_root, read_device_mapping_from_mirror, read_manifest_from_mirror};

pub fn copy_enabled_local_to_mirror(doc_set: &DocSet) -> AppResult<usize> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    let mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mut copied = 0;

    // Collect all non-root mirror_paths so root source can exclude them
    let sibling_paths: std::collections::HashSet<String> = manifest
        .sources
        .iter()
        .filter(|s| s.mirror_path != ".")
        .map(|s| s.mirror_path.clone())
        .collect();

    for source in &manifest.sources {
        let Some(mapping) = mappings
            .mappings
            .iter()
            .find(|mapping| mapping.source_id == source.id)
        else {
            continue;
        };
        if !mapping.enabled
            || matches!(
                mapping.direction,
                SyncDirection::MirrorOnly | SyncDirection::MirrorToLocal
            )
        {
            continue;
        }
        let Some(local_path) = &mapping.local_path else {
            continue;
        };
        let local = Path::new(local_path);
        if !local.exists() {
            continue;
        }
        let target = mirror.join(&source.mirror_path);

        // If this is the root source ("."), exclude sibling source directories
        if source.mirror_path == "." {
            copied +=
                mirror_service::copy_to_staging_with_excludes(local, &target, &sibling_paths)?
                    .copied;
        } else {
            copied += mirror_service::copy_to_staging(local, &target)?.copied;
        }
    }

    Ok(copied)
}
pub fn copy_enabled_mirror_to_local(doc_set: &DocSet) -> AppResult<usize> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    let mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mut copied = 0;

    // Collect all non-root mirror_paths so root source can exclude them
    let sibling_paths: std::collections::HashSet<String> = manifest
        .sources
        .iter()
        .filter(|s| s.mirror_path != ".")
        .map(|s| s.mirror_path.clone())
        .collect();

    for source in &manifest.sources {
        let Some(mapping) = mappings
            .mappings
            .iter()
            .find(|mapping| mapping.source_id == source.id)
        else {
            continue;
        };
        if !mapping.enabled
            || matches!(
                mapping.direction,
                SyncDirection::MirrorOnly | SyncDirection::LocalToMirror
            )
        {
            continue;
        }
        let Some(local_path) = &mapping.local_path else {
            continue;
        };
        let source_mirror = mirror.join(&source.mirror_path);
        let local = Path::new(local_path);
        if !source_mirror.exists() {
            // Source folder is entirely absent from the mirror. Skip instead of
            // wiping the whole mapped local folder: an absent source usually
            // means a drifted/incomplete mirror, not a deliberate delete, and a
            // wholesale delete risks data loss. This mirrors the push side
            // (copy_enabled_local_to_mirror), which skips a missing local source.
            continue;
        }

        // If this is the root source ("."), exclude sibling source directories
        if source.mirror_path == "." {
            copied += mirror_service::copy_from_staging_with_excludes(
                &source_mirror,
                local,
                &sibling_paths,
            )?
            .copied;
        } else {
            copied += mirror_service::copy_from_staging(&source_mirror, local)?.copied;
        }
    }

    Ok(copied)
}

/// Push from local (local wins): force-copy every enabled source's local folder
/// into the mirror, overwriting conflicts and adding files, but never deleting
/// mirror files that are only in the repo. Direction is ignored (treated as
/// bidirectional); only `enabled` gates a source.
pub fn push_from_local(doc_set: &DocSet) -> AppResult<usize> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    let mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mut copied = 0;

    let sibling_paths: std::collections::HashSet<String> = manifest
        .sources
        .iter()
        .filter(|s| s.mirror_path != ".")
        .map(|s| s.mirror_path.clone())
        .collect();

    for source in &manifest.sources {
        let Some(mapping) = mappings
            .mappings
            .iter()
            .find(|mapping| mapping.source_id == source.id)
        else {
            continue;
        };
        if !mapping.enabled {
            continue;
        }
        let Some(local_path) = &mapping.local_path else {
            continue;
        };
        let local = Path::new(local_path);
        if !local.exists() {
            continue;
        }
        let target = mirror.join(&source.mirror_path);
        if source.mirror_path == "." {
            copied += mirror_service::force_copy_with_excludes(local, &target, &sibling_paths)?.copied;
        } else {
            copied += mirror_service::force_copy_with_excludes(
                local,
                &target,
                &std::collections::HashSet::new(),
            )?
            .copied;
        }
    }

    Ok(copied)
}

/// Pull from repo (repo wins): force-copy every enabled source's mirror folder
/// into its local path, overwriting conflicts and adding files, but never
/// deleting local files that are only on this device. Direction is ignored
/// (treated as bidirectional); only `enabled` gates a source. A source folder
/// that is entirely absent from the mirror is skipped (local kept, not wiped).
pub fn pull_from_repo(doc_set: &DocSet) -> AppResult<usize> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    let mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mut copied = 0;

    let sibling_paths: std::collections::HashSet<String> = manifest
        .sources
        .iter()
        .filter(|s| s.mirror_path != ".")
        .map(|s| s.mirror_path.clone())
        .collect();

    for source in &manifest.sources {
        let Some(mapping) = mappings
            .mappings
            .iter()
            .find(|mapping| mapping.source_id == source.id)
        else {
            continue;
        };
        if !mapping.enabled {
            continue;
        }
        let Some(local_path) = &mapping.local_path else {
            continue;
        };
        let source_mirror = mirror.join(&source.mirror_path);
        let local = Path::new(local_path);
        if !source_mirror.exists() {
            continue;
        }
        if source.mirror_path == "." {
            copied +=
                mirror_service::force_copy_with_excludes(&source_mirror, local, &sibling_paths)?.copied;
        } else {
            copied += mirror_service::force_copy_with_excludes(
                &source_mirror,
                local,
                &std::collections::HashSet::new(),
            )?
            .copied;
        }
    }

    Ok(copied)
}
