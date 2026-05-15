use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use crate::services::mirror_service;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocSetManifest {
    pub version: u32,
    pub doc_set_id: String,
    pub name: String,
    pub sources: Vec<ManifestSource>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestSource {
    pub id: String,
    pub alias: String,
    pub kind: String,
    pub mirror_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct DeviceMappingFile {
    pub device_id: String,
    pub mappings: Vec<SourceMapping>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourceMapping {
    pub source_id: String,
    pub local_path: Option<String>,
    pub enabled: bool,
    pub direction: SyncDirection,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncDirection {
    TwoWay,
    MirrorToLocal,
    LocalToMirror,
    MirrorOnly,
}

#[derive(Serialize, Clone, Debug)]
pub struct SourceMappingView {
    pub source: ManifestSource,
    pub mapping: SourceMapping,
    pub status: String,
    pub severity: String,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct MappingOverview {
    pub manifest: DocSetManifest,
    pub sources: Vec<SourceMappingView>,
}

#[derive(Deserialize, Debug)]
pub struct SetSourceMappingInput {
    pub doc_set_id: String,
    pub source_id: String,
    pub local_path: Option<String>,
    pub enabled: bool,
    pub direction: SyncDirection,
}

#[derive(Deserialize, Debug)]
pub struct AddSourceInput {
    pub doc_set_id: String,
    pub source_path: String,
    pub alias: String,
}

#[derive(Deserialize, Debug)]
pub struct AddMirrorSourceInput {
    pub doc_set_id: String,
    pub mirror_path: String,
    pub alias: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct RemoveMirrorPathInput {
    pub doc_set_id: String,
    pub mirror_path: String,
}

#[derive(Deserialize, Debug)]
pub struct MappingPreflightInput {
    pub doc_set_id: String,
    pub mirror_path: String,
    pub local_path: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct MappingPreflight {
    pub status: String,
    pub mirror_path: String,
    pub local_path: String,
    pub local_exists: bool,
    pub local_is_empty: bool,
    pub same: usize,
    pub only_mirror: usize,
    pub only_local: usize,
    pub conflicts: usize,
    pub samples: Vec<MappingPreflightSample>,
}

#[derive(Serialize, Clone, Debug)]
pub struct MappingPreflightSample {
    pub path: String,
    pub kind: String,
}

pub fn write_manifest(doc_set: &DocSet) -> AppResult<()> {
    let mirror = mirror_root(doc_set)?;
    let meta_dir = mirror.join(".open-sesame");
    fs::create_dir_all(&meta_dir)?;

    let manifest = if meta_dir.join("doc-set.json").exists() {
        let mut existing = read_manifest_from_mirror(&mirror)?;
        existing.name = doc_set.display_name.clone();
        existing
    } else {
        DocSetManifest {
            version: 1,
            doc_set_id: doc_set.id.clone(),
            name: doc_set.display_name.clone(),
            sources: vec![ManifestSource {
                id: "primary".into(),
                alias: doc_set.display_name.clone(),
                kind: "directory".into(),
                mirror_path: ".".into(),
            }],
        }
    };

    write_manifest_to_mirror(&mirror, &manifest)?;
    let mut mappings = read_device_mapping_from_mirror(&mirror).unwrap_or_else(|_| DeviceMappingFile {
        device_id: "local".into(),
        mappings: vec![],
    });
    let primary_local_path = if doc_set.source_path == mirror.to_string_lossy() {
        None
    } else {
        Some(doc_set.source_path.clone())
    };
    ensure_default_mapping(&mut mappings, "primary", primary_local_path);
    write_device_mapping_to_mirror(&mirror, &mappings)?;
    ensure_internal_metadata_excluded(&mirror)?;
    Ok(())
}

pub fn mapping_overview(doc_set: &DocSet) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    let mut mapping_file = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mut changed = false;

    for source in &manifest.sources {
        if !mapping_file
            .mappings
            .iter()
            .any(|mapping| mapping.source_id == source.id)
        {
            mapping_file.mappings.push(default_mapping(&source.id, None));
            changed = true;
        }
    }

    if changed {
        write_device_mapping_to_mirror(&mirror, &mapping_file)?;
    }

    let sources = manifest
        .sources
        .iter()
        .map(|source| {
            let mapping = mapping_file
                .mappings
                .iter()
                .find(|mapping| mapping.source_id == source.id)
                .cloned()
                .unwrap_or_else(|| default_mapping(&source.id, None));
            let (status, severity, message) = mapping_status(&mapping, source);
            SourceMappingView {
                source: source.clone(),
                mapping,
                status,
                severity,
                message,
            }
        })
        .collect();

    Ok(MappingOverview { manifest, sources })
}

pub fn set_source_mapping(doc_set: &DocSet, input: SetSourceMappingInput) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    if !manifest.sources.iter().any(|source| source.id == input.source_id) {
        return Err(AppError::Validation(format!(
            "Unknown source id: {}",
            input.source_id
        )));
    }

    let mut mapping_file = read_device_mapping_from_mirror(&mirror).unwrap_or_default();
    let mapping = SourceMapping {
        source_id: input.source_id,
        local_path: input.local_path.filter(|path| !path.trim().is_empty()),
        enabled: input.enabled,
        direction: input.direction,
    };

    if let Some(existing) = mapping_file
        .mappings
        .iter_mut()
        .find(|existing| existing.source_id == mapping.source_id)
    {
        *existing = mapping;
    } else {
        mapping_file.mappings.push(mapping);
    }

    write_device_mapping_to_mirror(&mirror, &mapping_file)?;
    mapping_overview(doc_set)
}

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
        return Err(AppError::Validation("Only folder sources are supported for now".into()));
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

pub fn add_mirror_source(doc_set: &DocSet, input: AddMirrorSourceInput) -> AppResult<MappingOverview> {
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

pub fn remove_new_mirror_path(doc_set: &DocSet, input: RemoveMirrorPathInput) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let relative_mirror = normalize_mirror_path(&input.mirror_path)?;
    if relative_mirror == "." {
        return Err(AppError::Validation("Cannot remove the whole repo mirror.".into()));
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

pub fn mapping_preflight(doc_set: &DocSet, input: MappingPreflightInput) -> AppResult<MappingPreflight> {
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

pub fn preserve_local_changes_in_mirror(doc_set: &DocSet, input: MappingPreflightInput) -> AppResult<usize> {
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
            || matches!(mapping.direction, SyncDirection::MirrorOnly | SyncDirection::MirrorToLocal)
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
            copied += mirror_service::copy_to_staging_with_excludes(local, &target, &sibling_paths)?.copied;
        } else {
            copied += mirror_service::copy_to_staging(local, &target)?.copied;
        }
    }

    Ok(copied)
}

fn collect_file_hashes(root: &Path) -> AppResult<HashMap<String, String>> {
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

fn collect_file_paths(root: &Path) -> AppResult<HashMap<String, PathBuf>> {
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

fn collect_file_paths_recursive(root: &Path, current: &Path, files: &mut HashMap<String, PathBuf>) -> AppResult<()> {
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

fn unique_local_copy_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let extension = path.extension().map(|value| value.to_string_lossy().to_string());
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

fn collect_file_hashes_recursive(root: &Path, current: &Path, files: &mut HashMap<String, String>) -> AppResult<()> {
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
    matches!(name, ".git" | ".open-sesame" | ".DS_Store" | "Thumbs.db" | "node_modules")
}

fn push_preflight_sample(samples: &mut Vec<MappingPreflightSample>, path: String, kind: &str) {
    if samples.len() >= 8 {
        return;
    }
    samples.push(MappingPreflightSample {
        path,
        kind: kind.into(),
    });
}

fn ensure_path_is_only_new_in_git(mirror: &Path, relative_mirror: &str) -> AppResult<()> {
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
            "This path is already tracked by git, so it cannot be removed as a new mirror item.".into(),
        ));
    }

    Ok(())
}

fn remove_manifest_entries_under_path(mirror: &Path, relative_mirror: &str) -> AppResult<()> {
    let mut manifest = read_manifest_from_mirror(mirror)?;
    let prefix = format!("{relative_mirror}/");
    let removed_source_ids: Vec<String> = manifest
        .sources
        .iter()
        .filter(|source| source.mirror_path == relative_mirror || source.mirror_path.starts_with(&prefix))
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
            || matches!(mapping.direction, SyncDirection::MirrorOnly | SyncDirection::LocalToMirror)
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
            )?.copied;
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

fn mirror_root(doc_set: &DocSet) -> AppResult<PathBuf> {
    doc_set
        .mirror_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Internal("Doc set has no mirror path".into()))
}

fn read_manifest_from_mirror(mirror: &Path) -> AppResult<DocSetManifest> {
    let content = fs::read_to_string(mirror.join(".open-sesame/doc-set.json"))?;
    serde_json::from_str(&content)
        .map_err(|err| AppError::Internal(format!("Failed to parse doc set manifest: {err}")))
}

fn write_manifest_to_mirror(mirror: &Path, manifest: &DocSetManifest) -> AppResult<()> {
    let meta_dir = mirror.join(".open-sesame");
    fs::create_dir_all(&meta_dir)?;
    let manifest_json = serde_json::to_string_pretty(manifest)
        .map_err(|err| AppError::Internal(format!("Failed to serialize doc set manifest: {err}")))?;
    fs::write(meta_dir.join("doc-set.json"), manifest_json)?;
    Ok(())
}

fn read_device_mapping_from_mirror(mirror: &Path) -> AppResult<DeviceMappingFile> {
    let path = mirror.join(".open-sesame/device.local.json");
    if !path.exists() {
        return Ok(DeviceMappingFile {
            device_id: "local".into(),
            mappings: vec![],
        });
    }
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content)
        .map_err(|err| AppError::Internal(format!("Failed to parse device mapping: {err}")))
}

fn write_device_mapping_to_mirror(mirror: &Path, mapping: &DeviceMappingFile) -> AppResult<()> {
    let meta_dir = mirror.join(".open-sesame");
    fs::create_dir_all(&meta_dir)?;
    let json = serde_json::to_string_pretty(mapping)
        .map_err(|err| AppError::Internal(format!("Failed to serialize device mapping: {err}")))?;
    fs::write(meta_dir.join("device.local.json"), json)?;
    Ok(())
}

fn ensure_default_mapping(mapping_file: &mut DeviceMappingFile, source_id: &str, local_path: Option<String>) {
    if mapping_file.device_id.is_empty() {
        mapping_file.device_id = "local".into();
    }
    if mapping_file
        .mappings
        .iter()
        .any(|mapping| mapping.source_id == source_id)
    {
        return;
    }
    mapping_file.mappings.push(default_mapping(source_id, local_path));
}

fn default_mapping(source_id: &str, local_path: Option<String>) -> SourceMapping {
    SourceMapping {
        source_id: source_id.into(),
        local_path,
        enabled: true,
        direction: SyncDirection::TwoWay,
    }
}

fn mapping_status(mapping: &SourceMapping, source: &ManifestSource) -> (String, String, String) {
    if !mapping.enabled {
        return (
            "disabled".into(),
            "info".into(),
            "This source is disabled on this device.".into(),
        );
    }
    if matches!(mapping.direction, SyncDirection::MirrorOnly) {
        return (
            "mirror_only".into(),
            "info".into(),
            "This source is readable from the mirror but will not write to local paths.".into(),
        );
    }
    let Some(local_path) = &mapping.local_path else {
        return (
            "missing_local_path".into(),
            "blocked".into(),
            format!("{} needs a local path before it can sync on this device.", source.alias),
        );
    };
    let local = Path::new(local_path);
    if local.exists() && !local.is_dir() && source.kind == "directory" {
        return (
            "path_type_mismatch".into(),
            "blocked".into(),
            "The selected local path is not a folder.".into(),
        );
    }
    (
        "ready".into(),
        "ok".into(),
        "Ready to sync on this device.".into(),
    )
}

fn unique_source_id(manifest: &DocSetManifest, alias: &str) -> String {
    let base = slugify(alias);
    if !manifest.sources.iter().any(|source| source.id == base) {
        return base;
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base}-{index}");
        if !manifest.sources.iter().any(|source| source.id == candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn unique_root_path(mirror: &Path, manifest: &DocSetManifest, preferred: &str) -> String {
    if !mirror.join(preferred).exists()
        && !manifest
            .sources
            .iter()
            .any(|source| source.mirror_path == preferred)
    {
        return preferred.into();
    }

    let mut index = 2;
    loop {
        let candidate = format!("{preferred}-{index}");
        if !mirror.join(&candidate).exists()
            && !manifest
                .sources
                .iter()
                .any(|source| source.mirror_path == candidate)
        {
            return candidate;
        }
        index += 1;
    }
}

fn normalize_mirror_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim().replace('\\', "/");
    let normalized = if trimmed.is_empty() { ".".into() } else { trimmed };

    if normalized == "." {
        return Ok(normalized);
    }
    if normalized.starts_with('/')
        || normalized.split('/').any(|part| part == ".." || part.is_empty())
        || normalized.starts_with(".open-sesame")
        || normalized == ".git"
        || normalized.starts_with(".git/")
    {
        return Err(AppError::Validation("Invalid mirror path.".into()));
    }

    Ok(normalized)
}

fn slugify(value: &str) -> String {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        "source".into()
    } else {
        slug
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::account::ProviderType;
    use crate::models::doc_set::{DocSetStatus, Strategy};
    use tempfile::TempDir;

    fn make_doc_set(mirror_path: &Path, source_path: &Path) -> DocSet {
        let now = chrono::Utc::now();
        DocSet {
            id: "ds1".into(),
            workspace_id: "ws1".into(),
            account_id: "acc1".into(),
            display_name: "Docs".into(),
            source_path: source_path.to_string_lossy().into(),
            strategy: Strategy::Mirrored,
            mirror_path: Some(mirror_path.to_string_lossy().into()),
            provider_type: ProviderType::Github,
            remote_url: None,
            remote_id: None,
            branch: "main".into(),
            auto_sync: false,
            last_synced_at: None,
            last_commit: None,
            status: DocSetStatus::Idle,
            has_mapping: false,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn test_write_manifest_creates_marker_and_mapping_without_worktree_gitignore() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let mirror = tmp.path().join("mirror");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&mirror).unwrap();
        let doc_set = make_doc_set(&mirror, &source);

        write_manifest(&doc_set).unwrap();

        assert!(mirror.join(".open-sesame/doc-set.json").exists());
        assert!(mirror.join(".open-sesame/device.local.json").exists());
        assert!(!mirror.join(".gitignore").exists());
    }

    #[test]
    fn test_add_source_updates_manifest_and_mapping() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let extra = tmp.path().join("extra");
        let mirror = tmp.path().join("mirror");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&extra).unwrap();
        fs::write(extra.join("note.md"), "hello").unwrap();
        fs::create_dir_all(&mirror).unwrap();
        let doc_set = make_doc_set(&mirror, &source);
        write_manifest(&doc_set).unwrap();

        add_source(
            &doc_set,
            AddSourceInput {
                doc_set_id: "ds1".into(),
                source_path: extra.to_string_lossy().into(),
                alias: "Extra Notes".into(),
            },
        )
        .unwrap();

        let overview = mapping_overview(&doc_set).unwrap();
        assert!(overview.manifest.sources.iter().any(|source| source.id == "extra-notes"));
        assert!(mirror.join("extra-notes/note.md").exists());
    }

    #[test]
    fn test_remove_new_mirror_path_removes_untracked_source() {
        let test_root = std::env::current_dir().unwrap().join("target/test-temp");
        fs::create_dir_all(&test_root).unwrap();
        let tmp = TempDir::new_in(test_root).unwrap();
        let source = tmp.path().join("source");
        let extra = tmp.path().join("extra");
        let mirror = tmp.path().join("mirror");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&extra).unwrap();
        fs::write(extra.join("note.md"), "hello").unwrap();
        fs::create_dir_all(&mirror).unwrap();
        git2::Repository::init(&mirror).unwrap();
        let doc_set = make_doc_set(&mirror, &source);
        write_manifest(&doc_set).unwrap();
        add_source(
            &doc_set,
            AddSourceInput {
                doc_set_id: "ds1".into(),
                source_path: extra.to_string_lossy().into(),
                alias: "Extra Notes".into(),
            },
        )
        .unwrap();

        let overview = remove_new_mirror_path(
            &doc_set,
            RemoveMirrorPathInput {
                doc_set_id: "ds1".into(),
                mirror_path: "extra-notes".into(),
            },
        )
        .unwrap();

        assert!(!mirror.join("extra-notes").exists());
        assert!(!overview
            .manifest
            .sources
            .iter()
            .any(|source| source.id == "extra-notes"));
    }

    #[test]
    fn test_copy_mirror_to_local_propagates_deleted_mirror_source() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let mirror = tmp.path().join("mirror");
        let local_child = tmp.path().join("local-child");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(mirror.join("child")).unwrap();
        fs::write(mirror.join("child/note.md"), "hello").unwrap();
        fs::create_dir_all(&local_child).unwrap();
        fs::write(local_child.join("note.md"), "hello").unwrap();
        let doc_set = make_doc_set(&mirror, &source);
        write_manifest(&doc_set).unwrap();
        add_mirror_source(
            &doc_set,
            AddMirrorSourceInput {
                doc_set_id: "ds1".into(),
                mirror_path: "child".into(),
                alias: Some("Child".into()),
            },
        )
        .unwrap();
        let overview = mapping_overview(&doc_set).unwrap();
        let child = overview
            .sources
            .iter()
            .find(|source| source.source.mirror_path == "child")
            .unwrap();
        set_source_mapping(
            &doc_set,
            SetSourceMappingInput {
                doc_set_id: "ds1".into(),
                source_id: child.source.id.clone(),
                local_path: Some(local_child.to_string_lossy().into()),
                enabled: true,
                direction: SyncDirection::TwoWay,
            },
        )
        .unwrap();

        fs::remove_dir_all(mirror.join("child")).unwrap();
        let removed = copy_enabled_mirror_to_local(&doc_set).unwrap();

        assert_eq!(removed, 1);
        assert!(!local_child.exists());
    }

    #[test]
    fn test_mapping_preflight_detects_empty_and_conflicts() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let mirror = tmp.path().join("mirror");
        let local = tmp.path().join("local");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&mirror).unwrap();
        fs::create_dir_all(&local).unwrap();
        fs::write(mirror.join("same.md"), "same").unwrap();
        fs::write(mirror.join("conflict.md"), "mirror").unwrap();
        fs::write(local.join("same.md"), "same").unwrap();
        fs::write(local.join("conflict.md"), "local").unwrap();
        fs::write(local.join("local-only.md"), "local only").unwrap();
        let doc_set = make_doc_set(&mirror, &source);
        write_manifest(&doc_set).unwrap();

        let preflight = mapping_preflight(
            &doc_set,
            MappingPreflightInput {
                doc_set_id: "ds1".into(),
                mirror_path: ".".into(),
                local_path: local.to_string_lossy().into(),
            },
        )
        .unwrap();

        assert_eq!(preflight.status, "has_conflicts");
        assert_eq!(preflight.same, 1);
        assert_eq!(preflight.only_local, 1);
        assert_eq!(preflight.conflicts, 1);

        let empty = tmp.path().join("empty");
        fs::create_dir_all(&empty).unwrap();
        let preflight = mapping_preflight(
            &doc_set,
            MappingPreflightInput {
                doc_set_id: "ds1".into(),
                mirror_path: ".".into(),
                local_path: empty.to_string_lossy().into(),
            },
        )
        .unwrap();

        assert_eq!(preflight.status, "empty");
        assert!(preflight.local_is_empty);
    }

    #[test]
    fn test_preserve_local_changes_keeps_conflict_copy() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let mirror = tmp.path().join("mirror");
        let local = tmp.path().join("local");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&mirror).unwrap();
        fs::create_dir_all(&local).unwrap();
        fs::write(mirror.join("conflict.md"), "mirror").unwrap();
        fs::write(local.join("conflict.md"), "local").unwrap();
        fs::write(local.join("local-only.md"), "local only").unwrap();
        let doc_set = make_doc_set(&mirror, &source);
        write_manifest(&doc_set).unwrap();

        let copied = preserve_local_changes_in_mirror(
            &doc_set,
            MappingPreflightInput {
                doc_set_id: "ds1".into(),
                mirror_path: ".".into(),
                local_path: local.to_string_lossy().into(),
            },
        )
        .unwrap();

        assert_eq!(copied, 2);
        assert_eq!(fs::read_to_string(mirror.join("conflict.md")).unwrap(), "mirror");
        assert_eq!(
            fs::read_to_string(mirror.join("conflict.local-copy.md")).unwrap(),
            "local"
        );
        assert_eq!(
            fs::read_to_string(mirror.join("local-only.md")).unwrap(),
            "local only"
        );
    }
}
