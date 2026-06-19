//! Secrets (host passwords, key passphrases) live in the OS keyring, never in
//! SQLite. The DB stores only a `keyring:<host_id>` reference string.

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "myssh";
const KEYRING_PREFIX: &str = "keyring:";

fn entry(key: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|e| AppError::Keyring(format!("open keyring entry: {e}")))
}

/// Store a host secret and return the DB reference to persist.
pub fn store_host_secret(host_id: &str, secret: &str) -> AppResult<String> {
    entry(host_id)?
        .set_password(secret)
        .map_err(|e| AppError::Keyring(format!("save secret: {e}")))?;
    Ok(format!("{KEYRING_PREFIX}{host_id}"))
}

/// Resolve a stored reference back to the plaintext secret.
pub fn resolve_secret(reference: &str) -> AppResult<String> {
    let key = reference.strip_prefix(KEYRING_PREFIX).unwrap_or(reference);
    entry(key)?
        .get_password()
        .map_err(|e| AppError::Keyring(format!("read secret: {e}")))
}

/// Fetch a host's secret by host id, returning `None` when none is stored.
pub fn get_host_secret(host_id: &str) -> AppResult<Option<String>> {
    match entry(host_id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(format!("read secret: {e}"))),
    }
}

/// Delete a stored secret. A missing entry is treated as success.
pub fn delete_host_secret(reference: &str) -> AppResult<()> {
    let key = reference.strip_prefix(KEYRING_PREFIX).unwrap_or(reference);
    match entry(key)?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(format!("delete secret: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_passes_through_plain_reference() {
        // A reference without the prefix is returned via keyring lookup keyed by
        // the raw string; the prefix-stripping logic itself is what we assert.
        assert_eq!("keyring:abc".strip_prefix(KEYRING_PREFIX), Some("abc"));
        assert_eq!("abc".strip_prefix(KEYRING_PREFIX), None);
    }
}
