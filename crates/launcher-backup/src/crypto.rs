use crate::BackupError;
use argon2::Argon2;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};

const MAGIC: &[u8; 7] = b"DLBAK1\0";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const HEADER_LEN: usize = 7 + 1 + SALT_LEN + NONCE_LEN;

const MODE_PASSPHRASE: u8 = 0;
const MODE_RAWKEY: u8 = 1;

fn random(buf: &mut [u8]) -> Result<(), BackupError> {
    getrandom::getrandom(buf).map_err(|e| BackupError::Crypto(format!("rng: {e}")))
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], BackupError> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| BackupError::Crypto(format!("argon2: {e}")))?;
    Ok(key)
}

fn header(mode: u8, salt: &[u8; SALT_LEN], nonce: &[u8; NONCE_LEN]) -> Vec<u8> {
    let mut h = Vec::with_capacity(HEADER_LEN);
    h.extend_from_slice(MAGIC);
    h.push(mode);
    h.extend_from_slice(salt);
    h.extend_from_slice(nonce);
    h
}

fn seal(plaintext: &[u8], key: &[u8; 32], mode: u8) -> Result<Vec<u8>, BackupError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    random(&mut salt)?;
    random(&mut nonce)?;
    let head = header(mode, &salt, &nonce);
    let cipher = XChaCha20Poly1305::new(key.into());
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad: &head })
        .map_err(|e| BackupError::Crypto(format!("seal: {e}")))?;
    let mut out = head;
    out.extend_from_slice(&ct);
    // For passphrase mode the salt in the header is the one used to derive `key`.
    Ok(out)
}

fn split<'a>(bundle: &'a [u8]) -> Result<(u8, &'a [u8], &'a [u8], &'a [u8]), BackupError> {
    if bundle.len() < HEADER_LEN || &bundle[0..7] != MAGIC {
        return Err(BackupError::Corrupt("bad magic/length".into()));
    }
    let mode = bundle[7];
    let salt = &bundle[8..8 + SALT_LEN];
    let nonce = &bundle[8 + SALT_LEN..HEADER_LEN];
    let ct = &bundle[HEADER_LEN..];
    Ok((mode, salt, nonce, ct))
}

fn open(bundle: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError> {
    let (_mode, _salt, nonce, ct) = split(bundle)?;
    let head = &bundle[..HEADER_LEN];
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: ct, aad: head })
        .map_err(|_| BackupError::WrongPassphrase)
}

pub fn seal_with_passphrase(plaintext: &[u8], passphrase: &str) -> Result<Vec<u8>, BackupError> {
    // Generate salt first so the derived key matches the header salt.
    let mut salt = [0u8; SALT_LEN];
    random(&mut salt)?;
    let key = derive_key(passphrase, &salt)?;
    let mut nonce = [0u8; NONCE_LEN];
    random(&mut nonce)?;
    let head = header(MODE_PASSPHRASE, &salt, &nonce);
    let cipher = XChaCha20Poly1305::new((&key).into());
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad: &head })
        .map_err(|e| BackupError::Crypto(format!("seal: {e}")))?;
    let mut out = head;
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn open_with_passphrase(bundle: &[u8], passphrase: &str) -> Result<Vec<u8>, BackupError> {
    let (mode, salt, _nonce, _ct) = split(bundle)?;
    if mode != MODE_PASSPHRASE {
        return Err(BackupError::Corrupt("not a passphrase bundle".into()));
    }
    let salt: [u8; SALT_LEN] = salt.try_into().unwrap();
    let key = derive_key(passphrase, &salt)?;
    open(bundle, &key)
}

pub fn seal_with_key(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError> {
    seal(plaintext, key, MODE_RAWKEY)
}

pub fn open_with_key(bundle: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError> {
    let (mode, _salt, _nonce, _ct) = split(bundle)?;
    if mode != MODE_RAWKEY {
        return Err(BackupError::Corrupt("not a raw-key bundle".into()));
    }
    open(bundle, key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BackupError;

    #[test]
    fn passphrase_round_trip() {
        let pt = b"hello secret payload";
        let sealed = seal_with_passphrase(pt, "correct horse").unwrap();
        let opened = open_with_passphrase(&sealed, "correct horse").unwrap();
        assert_eq!(opened, pt);
    }

    #[test]
    fn wrong_passphrase_fails() {
        let sealed = seal_with_passphrase(b"x", "right").unwrap();
        let err = open_with_passphrase(&sealed, "wrong").unwrap_err();
        assert!(matches!(err, BackupError::WrongPassphrase));
    }

    #[test]
    fn tamper_fails() {
        let mut sealed = seal_with_passphrase(b"data", "pw").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0xff;
        assert!(open_with_passphrase(&sealed, "pw").is_err());
    }

    #[test]
    fn raw_key_round_trip() {
        let key = [7u8; 32];
        let sealed = seal_with_key(b"abc", &key).unwrap();
        assert_eq!(open_with_key(&sealed, &key).unwrap(), b"abc");
    }
}
