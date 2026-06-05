use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use crate::services::mirror_service;
use std::fs;
use std::path::Path;

use super::git_guard::{ensure_path_is_only_new_in_git, remove_manifest_entries_under_path};
use super::models::{
    AddMirrorSourceInput, AddSourceInput, ManifestSource, MappingOverview, RemoveMirrorPathInput,
};
use super::overview::mapping_overview;
use super::storage::{
    ensure_default_mapping, mirror_root, normalize_mirror_path, read_device_mapping_from_mirror,
    read_manifest_from_mirror, unique_root_path, unique_source_id, write_device_mapping_to_mirror,
    write_manifest_to_mirror,
};

pub fn add_source(doc_set: &DocSet, input: AddSourceInput) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let source = Path::new(&input.source_path);
    if !source.exists() {
        return Err(AppError::Validation(format!(
            "Path does not exist: {}",
            source.display()
        )));
    }
    if !source.is_dir() {
        return Err(AppError::Validation(
            "Only folder sources are supported for now".into(),
        ));
    }

    let mut manifest = read_manifest_from_mirror(&mirror)?;
    let source_id = unique_source_id(&manifest, &input.alias);
    let relative_mirror = unique_root_path(&mirror, &manifest, &source_id);
    let target = mirror.join(&relative_mirror);
    mirror_service::copy_to_staging(source, &target)?;

    manifest.sources.push(ManifestSource {
        id: source_id.clone(),
        alias: input.alias.trim().to_string(),
        kind: "directory".into(),
        mirror_path: relative_mirror,
    });
    write_manifest_to_mirror(&mirror, &manifest)?;

    let mut mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    ensure_default_mapping(&mut mappings, &source_id, Some(input.source_path));
    write_device_mapping_to_mirror(&mirror, &mappings)?;
    mapping_overview(doc_set)
}

pub fn add_mirror_source(
    doc_set: &DocSet,
    input: AddMirrorSourceInput,
) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let relative_mirror = normalize_mirror_path(&input.mirror_path)?;
    let target = mirror.join(&relative_mirror);
    if !target.exists() {
        return Err(AppError::Validation(format!(
            "Mirror path does not exist: {}",
            relative_mirror
        )));
    }

    let mut manifest = read_manifest_from_mirror(&mirror)?;
    if manifest
        .sources
        .iter()
        .any(|source| source.mirror_path == relative_mirror)
    {
        return mapping_overview(doc_set);
    }

    let alias = input.alias.unwrap_or_else(|| {
        if relative_mirror == "." {
            doc_set.display_name.clone()
        } else {
            target
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| relative_mirror.clone())
        }
    });
    let source_id = unique_source_id(&manifest, &alias);
    manifest.sources.push(ManifestSource {
        id: source_id.clone(),
        alias: alias.trim().to_string(),
        kind: if target.is_dir() { "directory" } else { "file" }.into(),
        mirror_path: relative_mirror,
    });
    write_manifest_to_mirror(&mirror, &manifest)?;

    let mut mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    ensure_default_mapping(&mut mappings, &source_id, None);
    write_device_mapping_to_mirror(&mirror, &mappings)?;
    mapping_overview(doc_set)
}

pub fn remove_new_mirror_path(
    doc_set: &DocSet,
    input: RemoveMirrorPathInput,
) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let relative_mirror = normalize_mirror_path(&input.mirror_path)?;
    if relative_mirror == "." {
        return Err(AppError::Validation(
            "Cannot remove the whole repo mirror.".into(),
        ));
    }

    let target = mirror.join(&relative_mirror);
    if !target.exists() {
        return Err(AppError::Validation(format!(
            "Mirror path does not exist: {}",
            relative_mirror
        )));
    }

    ensure_path_is_only_new_in_git(&mirror, &relative_mirror)?;

    if target.is_dir() {
        fs::remove_dir_all(&target)?;
    } else {
        fs::remove_file(&target)?;
    }

    remove_manifest_entries_under_path(&mirror, &relative_mirror)?;
    mapping_overview(doc_set)
}
