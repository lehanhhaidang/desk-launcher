use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;

use super::file_compare::{
    collect_file_hashes, collect_file_paths, push_preflight_sample, unique_local_copy_path,
};
use super::models::{MappingPreflight, MappingPreflightInput};
use super::storage::{mirror_root, normalize_mirror_path};

pub fn mapping_preflight(
    doc_set: &DocSet,
    input: MappingPreflightInput,
) -> AppResult<MappingPreflight> {
    let mirror = mirror_root(doc_set)?;
    let relative_mirror = normalize_mirror_path(&input.mirror_path)?;
    let mirror_path = mirror.join(&relative_mirror);
    if !mirror_path.exists() {
        return Err(AppError::Validation(format!(
            "Mirror path does not exist: {}",
            relative_mirror
        )));
    }

    let local_path = PathBuf::from(&input.local_path);
    let mirror_files = collect_file_hashes(&mirror_path)?;
    let local_exists = local_path.exists();
    let local_files = if local_exists {
        collect_file_hashes(&local_path)?
    } else {
        HashMap::new()
    };
    let local_is_empty = local_files.is_empty();

    let all_paths = mirror_files
        .keys()
        .chain(local_files.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut same = 0;
    let mut only_mirror = 0;
    let mut only_local = 0;
    let mut conflicts = 0;
    let mut samples = Vec::new();

    for path in all_paths {
        match (mirror_files.get(&path), local_files.get(&path)) {
            (Some(left), Some(right)) if left == right => same += 1,
            (Some(_), Some(_)) => {
                conflicts += 1;
                push_preflight_sample(&mut samples, path, "conflict");
            }
            (Some(_), None) => {
                only_mirror += 1;
                push_preflight_sample(&mut samples, path, "only_mirror");
            }
            (None, Some(_)) => {
                only_local += 1;
                push_preflight_sample(&mut samples, path, "only_local");
            }
            (None, None) => {}
        }
    }

    let status = if !local_exists || local_is_empty {
        "empty"
    } else if conflicts > 0 {
        "has_conflicts"
    } else if only_local > 0 {
        "needs_decision"
    } else {
        "safe"
    };

    Ok(MappingPreflight {
        status: status.into(),
        mirror_path: relative_mirror,
        local_path: input.local_path,
        local_exists,
        local_is_empty,
        same,
        only_mirror,
        only_local,
        conflicts,
        samples,
    })
}

pub fn preserve_local_changes_in_mirror(
    doc_set: &DocSet,
    input: MappingPreflightInput,
) -> AppResult<usize> {
    let mirror = mirror_root(doc_set)?;
    let relative_mirror = normalize_mirror_path(&input.mirror_path)?;
    let mirror_path = mirror.join(&relative_mirror);
    let local_path = PathBuf::from(&input.local_path);
    if !mirror_path.exists() || !local_path.exists() {
        return Ok(0);
    }

    let mirror_files = collect_file_hashes(&mirror_path)?;
    let local_files = collect_file_hashes(&local_path)?;
    let local_paths = collect_file_paths(&local_path)?;
    let mut copied = 0;

    for (relative, local_hash) in local_files {
        match mirror_files.get(&relative) {
            None => {
                let Some(source) = local_paths.get(&relative) else {
                    continue;
                };
                let target = mirror_path.join(&relative);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(source, target)?;
                copied += 1;
            }
            Some(mirror_hash) if mirror_hash != &local_hash => {
                let Some(source) = local_paths.get(&relative) else {
                    continue;
                };
                let target = unique_local_copy_path(&mirror_path.join(&relative));
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(source, target)?;
                copied += 1;
            }
            Some(_) => {}
        }
    }

    Ok(copied)
}
