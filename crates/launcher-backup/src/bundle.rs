use crate::archive::{pack, unpack};
use crate::crypto::{open_with_key, open_with_passphrase, seal_with_key, seal_with_passphrase};
use crate::manifest::BackupManifest;
use crate::types::{BackupError, ExportFile};

const MANIFEST_PATH: &str = "manifest.json";

pub enum BundleKey<'a> {
    Passphrase(&'a str),
    Raw(&'a [u8; 32]),
}

pub struct ReadBundle {
    pub manifest: BackupManifest,
    pub files: Vec<ExportFile>,
}

pub fn write_bundle(
    manifest: &BackupManifest,
    files: &[ExportFile],
    key: BundleKey,
) -> Result<Vec<u8>, BackupError> {
    let manifest_json = serde_json::to_vec_pretty(manifest)
        .map_err(|e| BackupError::Manifest(e.to_string()))?;
    let mut all = Vec::with_capacity(files.len() + 1);
    all.push(ExportFile { rel_path: MANIFEST_PATH.into(), bytes: manifest_json });
    all.extend_from_slice(files);
    let tar = pack(&all)?;
    match key {
        BundleKey::Passphrase(p) => seal_with_passphrase(&tar, p),
        BundleKey::Raw(k) => seal_with_key(&tar, k),
    }
}

pub fn read_bundle(bytes: &[u8], key: BundleKey) -> Result<ReadBundle, BackupError> {
    let tar = match key {
        BundleKey::Passphrase(p) => open_with_passphrase(bytes, p)?,
        BundleKey::Raw(k) => open_with_key(bytes, k)?,
    };
    let mut files = unpack(&tar)?;
    let idx = files
        .iter()
        .position(|f| f.rel_path == MANIFEST_PATH)
        .ok_or_else(|| BackupError::Corrupt("missing manifest.json".into()))?;
    let manifest_file = files.remove(idx);
    let manifest: BackupManifest = serde_json::from_slice(&manifest_file.bytes)
        .map_err(|e| BackupError::Manifest(e.to_string()))?;
    Ok(ReadBundle { manifest, files })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{BackupManifest, BackupType, ModuleManifest};

    fn sample() -> (BackupManifest, Vec<ExportFile>) {
        let manifest = BackupManifest {
            version: 1, created_at_ms: 1, app_version: "0.1.0".into(),
            backup_type: BackupType::Full,
            modules: vec![ModuleManifest { id: "comtor".into(), include_heavy: false, file_count: 1 }],
        };
        let files = vec![ExportFile { rel_path: "comtor/db.sqlite".into(), bytes: vec![9, 9, 9] }];
        (manifest, files)
    }

    #[test]
    fn bundle_round_trips_with_passphrase() {
        let (m, f) = sample();
        let bytes = write_bundle(&m, &f, BundleKey::Passphrase("pw")).unwrap();
        let read = read_bundle(&bytes, BundleKey::Passphrase("pw")).unwrap();
        assert_eq!(read.manifest.modules[0].id, "comtor");
        assert_eq!(read.files.iter().find(|x| x.rel_path == "comtor/db.sqlite").unwrap().bytes, vec![9,9,9]);
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let (m, f) = sample();
        let bytes = write_bundle(&m, &f, BundleKey::Passphrase("pw")).unwrap();
        assert!(read_bundle(&bytes, BundleKey::Passphrase("nope")).is_err());
    }
}
