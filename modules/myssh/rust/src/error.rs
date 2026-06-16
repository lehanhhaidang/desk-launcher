use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("SSH error: {0}")]
    Ssh(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation: {0}")]
    Validation(String),

    #[error("Internal: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", &self.error_kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl AppError {
    /// Stable machine-readable kind so the frontend can branch on errors.
    pub fn error_kind(&self) -> &str {
        match self {
            Self::Database(_) => "database",
            Self::Io(_) => "io",
            Self::Serde(_) => "serde",
            Self::Keyring(_) => "keyring",
            Self::Ssh(_) => "ssh",
            Self::NotFound(_) => "not_found",
            Self::Validation(_) => "validation",
            Self::Internal(_) => "internal",
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_and_kind() {
        let err = AppError::Validation("label is required".into());
        assert_eq!(err.to_string(), "Validation: label is required");
        assert_eq!(err.error_kind(), "validation");
    }

    #[test]
    fn serializes_kind_and_message() {
        let err = AppError::NotFound("host x".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"kind\":\"not_found\""));
        assert!(json.contains("\"message\":\"Not found: host x\""));
    }
}
