use crate::error::{AppError, AppResult};
use crate::models::doc_set::DocSet;
use std::fs;

use super::metadata::ensure_internal_metadata_excluded;
use super::models::{
    DeviceMappingFile, DocSetManifest, ManifestSource, MappingOverview, SetSourceMappingInput,
    SourceMapping, SourceMappingView,
};
use super::storage::{
    default_mapping, ensure_default_mapping, mapping_status, mirror_root,
    read_device_mapping_from_mirror, read_manifest_from_mirror, write_device_mapping_to_mirror,
    write_manifest_to_mirror,
};

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
    let mut mappings =
        read_device_mapping_from_mirror(&mirror).unwrap_or_else(|_| DeviceMappingFile {
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
            mapping_file
                .mappings
                .push(default_mapping(&source.id, None));
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

pub fn set_source_mapping(
    doc_set: &DocSet,
    input: SetSourceMappingInput,
) -> AppResult<MappingOverview> {
    let mirror = mirror_root(doc_set)?;
    let manifest = read_manifest_from_mirror(&mirror)?;
    if !manifest
        .sources
        .iter()
        .any(|source| source.id == input.source_id)
    {
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
