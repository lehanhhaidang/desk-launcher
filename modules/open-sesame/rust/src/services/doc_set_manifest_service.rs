mod file_compare;
mod git_guard;
mod metadata;
mod models;
mod overview;
mod preflight;
mod sources;
mod storage;
mod transfer;

#[cfg(test)]
mod tests;

pub use metadata::ensure_internal_metadata_excluded;
pub use models::{
    AddMirrorSourceInput, AddSourceInput, DeviceMappingFile, DocSetManifest, ManifestSource,
    MappingOverview, MappingPreflight, MappingPreflightInput, MappingPreflightSample,
    RemoveMirrorPathInput, SetSourceMappingInput, SourceMapping, SourceMappingView, SyncDirection,
};
pub use overview::{mapping_overview, set_source_mapping, write_manifest};
pub use preflight::{mapping_preflight, preserve_local_changes_in_mirror};
pub use sources::{add_mirror_source, add_source, remove_new_mirror_path};
pub use transfer::{
    copy_enabled_local_to_mirror, copy_enabled_mirror_to_local, pull_from_repo, push_from_local,
};
