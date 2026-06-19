use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportFile {
    pub rel_path: String,
    #[serde(skip)]
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretEntry {
    pub account: String,
    pub value: String,
}

#[derive(Debug, Clone, Default)]
pub struct ModuleExport {
    pub files: Vec<ExportFile>,
    pub secrets: Vec<SecretEntry>,
}

#[derive(Debug, Clone, Default)]
pub struct ModuleImport {
    pub files: Vec<ExportFile>,
    pub secrets: Vec<SecretEntry>,
}

#[derive(Debug, Clone, Copy)]
pub struct ExportOptions {
    pub include_heavy: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum ImportMode {
    Replace,
}

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("io: {0}")]
    Io(String),
    #[error("archive: {0}")]
    Archive(String),
    #[error("manifest: {0}")]
    Manifest(String),
    #[error("database: {0}")]
    Db(String),
    #[error("keyring: {0}")]
    Keyring(String),
    #[error("wrong passphrase or damaged file")]
    WrongPassphrase,
    #[error("corrupt bundle: {0}")]
    Corrupt(String),
}

impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self {
        BackupError::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn module_export_is_constructible() {
        let m = ModuleExport {
            files: vec![ExportFile {
                rel_path: "db.sqlite".into(),
                bytes: vec![1, 2, 3],
            }],
            secrets: vec![SecretEntry {
                account: "host-1".into(),
                value: "pw".into(),
            }],
        };
        assert_eq!(m.files[0].rel_path, "db.sqlite");
        assert_eq!(m.secrets[0].value, "pw");
    }
}
