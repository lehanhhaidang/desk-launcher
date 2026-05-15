use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    Github,
    Gitlab,
    GoogleDrive,
}

impl ProviderType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Github => "github",
            Self::Gitlab => "gitlab",
            Self::GoogleDrive => "google_drive",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "github" => Some(Self::Github),
            "gitlab" => Some(Self::Gitlab),
            "google_drive" => Some(Self::GoogleDrive),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub provider: ProviderType,
    pub username: String,
    #[serde(skip_serializing)] // Không bao giờ gửi token về frontend
    pub token: String,
    #[serde(skip_serializing)]
    pub refresh_token: Option<String>,
    pub avatar_url: Option<String>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_type_roundtrip() {
        assert_eq!(ProviderType::from_str("github"), Some(ProviderType::Github));
        assert_eq!(
            ProviderType::from_str("google_drive"),
            Some(ProviderType::GoogleDrive)
        );
        assert_eq!(ProviderType::from_str("invalid"), None);
        assert_eq!(ProviderType::Github.as_str(), "github");
    }

    #[test]
    fn test_account_token_not_serialized() {
        let account = Account {
            id: "a1".into(),
            provider: ProviderType::Github,
            username: "user".into(),
            token: "secret_token".into(),
            refresh_token: None,
            avatar_url: None,
            is_default: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&account).unwrap();
        assert!(!json.contains("secret_token")); // Token KHÔNG có trong JSON
    }
}
