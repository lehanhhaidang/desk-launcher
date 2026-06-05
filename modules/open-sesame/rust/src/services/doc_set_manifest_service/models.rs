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
use serde::{Deserialize, Serialize};
