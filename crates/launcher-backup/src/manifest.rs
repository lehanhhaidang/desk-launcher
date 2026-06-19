use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupType {
    Full,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleManifest {
    pub id: String,
    pub include_heavy: bool,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub version: u32,
    pub created_at_ms: u64,
    pub app_version: String,
    pub backup_type: BackupType,
    pub modules: Vec<ModuleManifest>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_round_trips_json() {
        let m = BackupManifest {
            version: 1,
            created_at_ms: 123,
            app_version: "0.1.0".into(),
            backup_type: BackupType::Full,
            modules: vec![ModuleManifest {
                id: "myssh".into(),
                include_heavy: true,
                file_count: 2,
            }],
        };
        let json = serde_json::to_string(&m).unwrap();
        let back: BackupManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.version, 1);
        assert_eq!(back.modules[0].id, "myssh");
        assert!(matches!(back.backup_type, BackupType::Full));
    }
}
