use launcher_backup::BackupError;

const SERVICE: &str = "desk-launcher";
const ACCOUNT: &str = "backup-autokey";

pub fn encode_key(key: &[u8; 32]) -> String {
    key.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn decode_key(s: &str) -> Result<[u8; 32], BackupError> {
    if s.len() != 64 {
        return Err(BackupError::Crypto("bad key length".into()));
    }
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16)
            .map_err(|e| BackupError::Crypto(e.to_string()))?;
    }
    Ok(out)
}

pub fn get_or_create_autokey() -> Result<[u8; 32], BackupError> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| BackupError::Keyring(e.to_string()))?;
    match entry.get_password() {
        Ok(s) => decode_key(&s),
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            getrandom::getrandom(&mut key)
                .map_err(|e| BackupError::Crypto(e.to_string()))?;
            entry
                .set_password(&encode_key(&key))
                .map_err(|e| BackupError::Keyring(e.to_string()))?;
            Ok(key)
        }
        Err(e) => Err(BackupError::Keyring(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_key_round_trips() {
        let key = [3u8; 32];
        let s = encode_key(&key);
        assert_eq!(decode_key(&s).unwrap(), key);
    }
}
