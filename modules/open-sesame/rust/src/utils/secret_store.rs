use crate::error::{AppError, AppResult};
use crate::models::account::ProviderType;

const SERVICE_NAME: &str = "open-sesame";
const KEYRING_PREFIX: &str = "keyring:";

fn account_key(provider: &ProviderType, account_id: &str) -> String {
    format!("{}:{}", provider.as_str(), account_id)
}

fn keyring_entry(key: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|err| AppError::Auth(format!("Failed to access OS keyring: {err}")))
}

pub fn store_account_token(
    provider: &ProviderType,
    account_id: &str,
    token: &str,
) -> AppResult<String> {
    let key = account_key(provider, account_id);
    keyring_entry(&key)?
        .set_password(token)
        .map_err(|err| AppError::Auth(format!("Failed to save token in OS keyring: {err}")))?;

    Ok(format!("{KEYRING_PREFIX}{key}"))
}

pub fn resolve_token(stored_token: &str) -> AppResult<String> {
    let Some(key) = stored_token.strip_prefix(KEYRING_PREFIX) else {
        return Ok(stored_token.to_string());
    };

    keyring_entry(key)?
        .get_password()
        .map_err(|err| AppError::Auth(format!("Failed to read token from OS keyring: {err}")))
}

pub fn delete_stored_token(stored_token: &str) -> AppResult<()> {
    let Some(key) = stored_token.strip_prefix(KEYRING_PREFIX) else {
        return Ok(());
    };

    match keyring_entry(key)?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Auth(format!(
            "Failed to delete token from OS keyring: {err}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_legacy_plaintext_token() {
        assert_eq!(resolve_token("legacy-token").unwrap(), "legacy-token");
    }
}
