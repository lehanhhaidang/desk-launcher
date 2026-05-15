use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Auth error: {0}")]
    Auth(String),

    #[error("Sync error: {0}")]
    Sync(String),

    #[error("Provider error: {0}")]
    Provider(String),

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
    /// Trả về error kind string để frontend switch/match
    pub fn error_kind(&self) -> &str {
        match self {
            Self::Database(_) => "database",
            Self::Git(_) => "git",
            Self::Io(_) => "io",
            Self::Network(_) => "network",
            Self::Auth(_) => "auth",
            Self::Sync(_) => "sync",
            Self::Provider(_) => "provider",
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
    fn test_error_display() {
        let err = AppError::Validation("name is empty".into());
        assert_eq!(err.to_string(), "Validation: name is empty");
    }

    #[test]
    fn test_error_kind() {
        let err = AppError::Auth("token expired".into());
        assert_eq!(err.error_kind(), "auth");
    }

    #[test]
    fn test_error_serialize() {
        let err = AppError::NotFound("workspace".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"kind\":\"not_found\""));
        assert!(json.contains("\"message\":\"Not found: workspace\""));
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_err: AppError = io_err.into();
        assert_eq!(app_err.error_kind(), "io");
    }

    #[test]
    fn test_from_rusqlite_error() {
        let db_err = rusqlite::Error::QueryReturnedNoRows;
        let app_err: AppError = db_err.into();
        assert_eq!(app_err.error_kind(), "database");
    }
}
