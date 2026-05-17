use crate::error::AppResult;
use crate::models::doc_set::DocSet;
use crate::services::mirror_service;
use std::fs;
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
            copied += remove_local_path(local)?;
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

fn remove_local_path(path: &Path) -> AppResult<usize> {
    if !path.exists() {
        return Ok(0);
    }
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(1)
}
