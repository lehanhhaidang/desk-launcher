use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::models::{
    DeviceMappingFile, DocSetManifest, ManifestSource, SourceMapping, SyncDirection,
};

pub(super) fn mirror_root(doc_set: &DocSet) -> AppResult<PathBuf> {
    doc_set
        .mirror_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Internal("Doc set has no mirror path".into()))
}

pub(super) fn read_manifest_from_mirror(mirror: &Path) -> AppResult<DocSetManifest> {
    let content = fs::read_to_string(mirror.join(".open-sesame/doc-set.json"))?;
    serde_json::from_str(&content)
        .map_err(|err| AppError::Internal(format!("Failed to parse doc set manifest: {err}")))
}

pub(super) fn write_manifest_to_mirror(mirror: &Path, manifest: &DocSetManifest) -> AppResult<()> {
    let meta_dir = mirror.join(".open-sesame");
    fs::create_dir_all(&meta_dir)?;
    let manifest_json = serde_json::to_string_pretty(manifest).map_err(|err| {
        AppError::Internal(format!("Failed to serialize doc set manifest: {err}"))
    })?;
    fs::write(meta_dir.join("doc-set.json"), manifest_json)?;
    Ok(())
}

pub(super) fn read_device_mapping_from_mirror(mirror: &Path) -> AppResult<DeviceMappingFile> {
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

pub(super) fn write_device_mapping_to_mirror(
    mirror: &Path,
    mapping: &DeviceMappingFile,
) -> AppResult<()> {
    let meta_dir = mirror.join(".open-sesame");
    fs::create_dir_all(&meta_dir)?;
    let json = serde_json::to_string_pretty(mapping)
        .map_err(|err| AppError::Internal(format!("Failed to serialize device mapping: {err}")))?;
    fs::write(meta_dir.join("device.local.json"), json)?;
    Ok(())
}

pub(super) fn ensure_default_mapping(
    mapping_file: &mut DeviceMappingFile,
    source_id: &str,
    local_path: Option<String>,
) {
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
    mapping_file
        .mappings
        .push(default_mapping(source_id, local_path));
}

pub(super) fn default_mapping(source_id: &str, local_path: Option<String>) -> SourceMapping {
    SourceMapping {
        source_id: source_id.into(),
        local_path,
        enabled: true,
        direction: SyncDirection::TwoWay,
    }
}

pub(super) fn mapping_status(
    mapping: &SourceMapping,
    source: &ManifestSource,
) -> (String, String, String) {
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
            format!(
                "{} needs a local path before it can sync on this device.",
                source.alias
            ),
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

pub(super) fn unique_source_id(manifest: &DocSetManifest, alias: &str) -> String {
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

pub(super) fn unique_root_path(
    mirror: &Path,
    manifest: &DocSetManifest,
    preferred: &str,
) -> String {
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

pub(super) fn normalize_mirror_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim().replace('\\', "/");
    let normalized = if trimmed.is_empty() {
        ".".into()
    } else {
        trimmed
    };

    if normalized == "." {
        return Ok(normalized);
    }
    if normalized.starts_with('/')
        || normalized
            .split('/')
            .any(|part| part == ".." || part.is_empty())
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
