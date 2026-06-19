# Launcher Backup (Export / Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a launcher-level encrypted backup feature — export selected modules' data (DB + keyring secrets + files + appearance) into one passphrase-encrypted `.dlbak` file, and import it back (replace-per-module, auto-backup first).

**Architecture:** A shared `crates/launcher-backup` crate owns the bundle types, crypto (Argon2id + XChaCha20-Poly1305), and tar assembly. Each `tauri-plugin-<id>` crate exposes plain `export_data`/`import_data` fns (host calls them in-process). The launcher host orchestrates (gather → encrypt → write, and decrypt → restore) behind new app commands; the launcher frontend drives the wizards and handles appearance (`localStorage["theme:*"]`).

**Tech Stack:** Rust (Tauri 2, rusqlite, keyring), `argon2`, `chacha20poly1305`, `tar`, `sha2`, `getrandom`; React 19 + TypeScript frontend.

## Global Constraints

- Rust edition **2021**, rust-version floor **1.77.2** (workspace.package). New crates inherit via `edition.workspace = true`.
- **Windows-first**, pure-Rust crypto only (no NASM/aws-lc) — `argon2`, `chacha20poly1305`, `sha2` are all RustCrypto pure-Rust.
- **Secrets are gathered per-module** from each module's own DB/keyring; the host never reads another module's schema. Plaintext secrets live in RAM and inside the encrypted blob only — never written unencrypted to disk.
- **Module data paths** resolve via `launcher_paths::module_data_dir(id)` / `module_data_file(id, name)`. DB files: MySSH `myssh.db`, Open Sesame `data.db`, Comtor `vcomtor.db`.
- **Keyring:** MySSH service `myssh` (account = `host_id`); Open Sesame service `open-sesame` (account = `<provider>:<account_id>`); Comtor service `virtual_comtor` (accounts `soniox_api_key`, `openai_api_key`). Auto-backup key: service `desk-launcher`, account `backup-autokey`.
- **UI strings English-only** in product code (Vietnamese only in chat/task notes).
- **Bundle magic** `b"DLBAK1\0"`; manifest `version = 1`.
- **Import mode v1 = Replace only.** Optional heavy items (MySSH key files, Open Sesame mirrors, Comtor audio) default **ON** at export.

---

## File Structure

**New shared crate**
- `crates/launcher-backup/Cargo.toml` — deps: argon2, chacha20poly1305, tar, sha2, getrandom, serde, serde_json, thiserror.
- `crates/launcher-backup/src/lib.rs` — re-exports.
- `crates/launcher-backup/src/types.rs` — `ExportFile`, `SecretEntry`, `ModuleExport`, `ModuleImport`, `ExportOptions`, `ImportMode`, `BackupError`.
- `crates/launcher-backup/src/manifest.rs` — `BackupManifest`, `ModuleManifest`, `BackupType`.
- `crates/launcher-backup/src/crypto.rs` — header + `seal`/`open` (passphrase and raw-key).
- `crates/launcher-backup/src/archive.rs` — tar `pack`/`unpack`.
- `crates/launcher-backup/src/bundle.rs` — `write_bundle`/`read_bundle` (manifest+files ↔ encrypted bytes).

**Per-module (each adds one file + 1 line in its `lib.rs`)**
- `modules/myssh/rust/src/backup.rs` + `pub mod backup;` in `modules/myssh/rust/src/lib.rs`
- `modules/open-sesame/rust/src/backup.rs` + `pub mod backup;`
- `modules/comtor/rust/src/backup.rs` + `pub mod backup;`
- (Video Downloader & MD Converter: no Rust — appearance-only, handled by the frontend.)

**Launcher host**
- `apps/launcher/src-tauri/src/backup/mod.rs` — orchestrator + app commands.
- `apps/launcher/src-tauri/src/backup/autokey.rs` — auto-backup keyring key + retention.
- Modify `apps/launcher/src-tauri/src/lib.rs` — register commands; `apps/launcher/src-tauri/Cargo.toml` — add deps.

**Launcher frontend**
- `apps/launcher/src/features/backup/backup-api.ts` — invoke wrappers + appearance helpers.
- `apps/launcher/src/features/backup/ExportWizard.tsx`, `ImportWizard.tsx`, `BackupPanel.tsx`.
- Modify `apps/launcher/src/pages/Dashboard.tsx` — mount `<BackupPanel>` in `SettingsModal`.

**Docs (final task)** — `desk-launcher-docs/modules/{00-index,01-launcher-host,02-myssh,03-open-sesame,04-comtor,07-shared-infra}.md`.

---

## Phase 1 — Shared crate `launcher-backup`

### Task 1: Crate skeleton + workspace wiring

**Files:**
- Create: `crates/launcher-backup/Cargo.toml`, `crates/launcher-backup/src/lib.rs`
- Modify: `Cargo.toml` (workspace members)

- [ ] **Step 1: Add the crate to the workspace members**

In root `Cargo.toml`, add to `members` (after `"crates/launcher-paths",`):
```toml
  "crates/launcher-backup",
```

- [ ] **Step 2: Write the crate Cargo.toml**

Create `crates/launcher-backup/Cargo.toml`:
```toml
[package]
name = "launcher-backup"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
authors.workspace = true

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
argon2 = "0.5"
chacha20poly1305 = "0.10"
tar = "0.4"
sha2 = "0.10"
getrandom = "0.2"
```

- [ ] **Step 3: Write a stub lib.rs with one passing test**

Create `crates/launcher-backup/src/lib.rs`:
```rust
pub mod types;
pub mod manifest;
pub mod crypto;
pub mod archive;
pub mod bundle;

pub use types::*;
pub use manifest::*;
pub use bundle::{read_bundle, write_bundle, ReadBundle};
```
(Modules are created in later tasks; create empty `types.rs`, `manifest.rs`, `crypto.rs`, `archive.rs`, `bundle.rs` so it compiles, or implement Task 2 next before building.)

- [ ] **Step 4: Verify the workspace recognizes the crate**

Run: `cargo metadata --format-version 1 --no-deps` (from repo root)
Expected: `launcher-backup` appears in the package list. (Full build comes after Task 2–5 fill the modules.)

- [ ] **Step 5: Commit**
```bash
git add Cargo.toml crates/launcher-backup
git commit -m "feat(backup): scaffold launcher-backup crate"
```

---

### Task 2: Bundle types + manifest

**Files:**
- Create: `crates/launcher-backup/src/types.rs`, `crates/launcher-backup/src/manifest.rs`

**Interfaces:**
- Produces:
  - `struct ExportFile { rel_path: String, bytes: Vec<u8> }`
  - `struct SecretEntry { account: String, value: String }`
  - `struct ModuleExport { files: Vec<ExportFile>, secrets: Vec<SecretEntry> }`
  - `struct ModuleImport { files: Vec<ExportFile>, secrets: Vec<SecretEntry> }`
  - `struct ExportOptions { include_heavy: bool }`
  - `enum ImportMode { Replace }`
  - `enum BackupError { Crypto(String), Io(String), Archive(String), Manifest(String), Db(String), Keyring(String), WrongPassphrase, Corrupt(String) }`
  - `struct BackupManifest { version: u32, created_at_ms: u64, app_version: String, backup_type: BackupType, modules: Vec<ModuleManifest> }`
  - `struct ModuleManifest { id: String, include_heavy: bool, file_count: usize }`
  - `enum BackupType { Full, Auto }`

- [ ] **Step 1: Write the failing test for types serde**

Create `crates/launcher-backup/src/types.rs` test module at the bottom:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn module_export_is_constructible() {
        let m = ModuleExport {
            files: vec![ExportFile { rel_path: "db.sqlite".into(), bytes: vec![1, 2, 3] }],
            secrets: vec![SecretEntry { account: "host-1".into(), value: "pw".into() }],
        };
        assert_eq!(m.files[0].rel_path, "db.sqlite");
        assert_eq!(m.secrets[0].value, "pw");
    }
}
```

- [ ] **Step 2: Implement `types.rs`**
```rust
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
    #[error("crypto: {0}")] Crypto(String),
    #[error("io: {0}")] Io(String),
    #[error("archive: {0}")] Archive(String),
    #[error("manifest: {0}")] Manifest(String),
    #[error("database: {0}")] Db(String),
    #[error("keyring: {0}")] Keyring(String),
    #[error("wrong passphrase or damaged file")] WrongPassphrase,
    #[error("corrupt bundle: {0}")] Corrupt(String),
}

impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self { BackupError::Io(e.to_string()) }
}
```
(Secrets cross module→host as the in-RAM `SecretEntry`; inside the tar they are serialized to a `secrets.json` file — see Task 6 — so `value` does serialize there. `ExportFile.bytes` is `#[serde(skip)]` because file bytes ride in the tar, not the manifest JSON.)

- [ ] **Step 3: Write the failing test for manifest serde round-trip**

Add to `crates/launcher-backup/src/manifest.rs`:
```rust
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
            modules: vec![ModuleManifest { id: "myssh".into(), include_heavy: true, file_count: 2 }],
        };
        let json = serde_json::to_string(&m).unwrap();
        let back: BackupManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.version, 1);
        assert_eq!(back.modules[0].id, "myssh");
        assert!(matches!(back.backup_type, BackupType::Full));
    }
}
```

- [ ] **Step 4: Implement `manifest.rs`**
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupType { Full, Auto }

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
```

- [ ] **Step 5: Run the tests**

Run: `cargo test -p launcher-backup types:: manifest::`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add crates/launcher-backup/src
git commit -m "feat(backup): bundle types + manifest"
```

---

### Task 3: Crypto (Argon2id KDF + XChaCha20-Poly1305 AEAD)

**Files:**
- Create: `crates/launcher-backup/src/crypto.rs`

**Interfaces:**
- Produces:
  - `fn seal_with_passphrase(plaintext: &[u8], passphrase: &str) -> Result<Vec<u8>, BackupError>`
  - `fn open_with_passphrase(bundle: &[u8], passphrase: &str) -> Result<Vec<u8>, BackupError>`
  - `fn seal_with_key(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError>`
  - `fn open_with_key(bundle: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError>`
  - Header layout: `MAGIC(7) | mode(1: 0=passphrase,1=rawkey) | salt(16) | nonce(24) | ciphertext`

- [ ] **Step 1: Write the failing tests**
```rust
#[cfg(test)]
mod tests {
    use super::*;

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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cargo test -p launcher-backup crypto::`
Expected: FAIL (functions not defined).

- [ ] **Step 3: Implement `crypto.rs`**
```rust
use crate::types::BackupError;
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
```
(Note: the private `seal` helper is used only for raw-key mode; `seal_with_passphrase` is written out in full so the header salt is exactly the salt used for `derive_key`.)

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cargo test -p launcher-backup crypto::`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add crates/launcher-backup/src/crypto.rs
git commit -m "feat(backup): argon2id + xchacha20poly1305 sealed bundle"
```

---

### Task 4: Archive (tar pack/unpack)

**Files:**
- Create: `crates/launcher-backup/src/archive.rs`

**Interfaces:**
- Produces:
  - `fn pack(files: &[ExportFile]) -> Result<Vec<u8>, BackupError>`
  - `fn unpack(bytes: &[u8]) -> Result<Vec<ExportFile>, BackupError>`

- [ ] **Step 1: Write the failing test**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ExportFile;

    #[test]
    fn pack_unpack_round_trips() {
        let files = vec![
            ExportFile { rel_path: "manifest.json".into(), bytes: b"{}".to_vec() },
            ExportFile { rel_path: "myssh/db.sqlite".into(), bytes: vec![0, 1, 2, 3] },
        ];
        let packed = pack(&files).unwrap();
        let mut out = unpack(&packed).unwrap();
        out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].rel_path, "manifest.json");
        assert_eq!(out[1].bytes, vec![0, 1, 2, 3]);
    }
}
```

- [ ] **Step 2: Run to confirm fail**

Run: `cargo test -p launcher-backup archive::`
Expected: FAIL.

- [ ] **Step 3: Implement `archive.rs`**
```rust
use crate::types::{BackupError, ExportFile};
use std::io::{Cursor, Read};

pub fn pack(files: &[ExportFile]) -> Result<Vec<u8>, BackupError> {
    let mut builder = tar::Builder::new(Vec::new());
    for f in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(f.bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, &f.rel_path, Cursor::new(&f.bytes))
            .map_err(|e| BackupError::Archive(format!("append {}: {e}", f.rel_path)))?;
    }
    builder.into_inner().map_err(|e| BackupError::Archive(e.to_string()))
}

pub fn unpack(bytes: &[u8]) -> Result<Vec<ExportFile>, BackupError> {
    let mut archive = tar::Archive::new(Cursor::new(bytes));
    let mut out = Vec::new();
    for entry in archive.entries().map_err(|e| BackupError::Archive(e.to_string()))? {
        let mut entry = entry.map_err(|e| BackupError::Archive(e.to_string()))?;
        let path = entry
            .path()
            .map_err(|e| BackupError::Archive(e.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| BackupError::Archive(e.to_string()))?;
        out.push(ExportFile { rel_path: path, bytes: buf });
    }
    Ok(out)
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `cargo test -p launcher-backup archive::`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add crates/launcher-backup/src/archive.rs
git commit -m "feat(backup): tar pack/unpack"
```

---

### Task 5: Bundle writer/reader (manifest + files ↔ encrypted bytes)

**Files:**
- Create: `crates/launcher-backup/src/bundle.rs`

**Interfaces:**
- Consumes: `crypto::{seal_with_passphrase, open_with_passphrase, seal_with_key, open_with_key}`, `archive::{pack, unpack}`, `manifest::BackupManifest`.
- Produces:
  - `enum BundleKey<'a> { Passphrase(&'a str), Raw(&'a [u8; 32]) }`
  - `fn write_bundle(manifest: &BackupManifest, files: &[ExportFile], key: BundleKey) -> Result<Vec<u8>, BackupError>`
  - `struct ReadBundle { manifest: BackupManifest, files: Vec<ExportFile> }`
  - `fn read_bundle(bytes: &[u8], key: BundleKey) -> Result<ReadBundle, BackupError>`
  - Convention: manifest is stored inside the tar as `manifest.json`.

- [ ] **Step 1: Write the failing test**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{BackupManifest, BackupType, ModuleManifest};
    use crate::types::ExportFile;

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
```

- [ ] **Step 2: Run to confirm fail**

Run: `cargo test -p launcher-backup bundle::`
Expected: FAIL.

- [ ] **Step 3: Implement `bundle.rs`**
```rust
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
```

- [ ] **Step 4: Run all crate tests**

Run: `cargo test -p launcher-backup`
Expected: PASS (all tasks 2–5 tests green).

- [ ] **Step 5: Commit**
```bash
git add crates/launcher-backup/src
git commit -m "feat(backup): bundle writer/reader (manifest in tar)"
```

---

## Phase 2 — Per-module export/import contract

Shared helper used by every module: a consistent DB snapshot. Each module's `backup.rs` uses `rusqlite`'s `VACUUM INTO` to get a consistent single-file copy even while the live connection is open elsewhere, then reads the bytes.

### Task 6: MySSH `export_data` / `import_data`

**Files:**
- Create: `modules/myssh/rust/src/backup.rs`
- Modify: `modules/myssh/rust/src/lib.rs` (add `pub mod backup;`), `modules/myssh/rust/Cargo.toml` (add `launcher-backup` path dep)

**Interfaces:**
- Consumes: `launcher_backup::{ExportOptions, ImportMode, ModuleExport, ModuleImport, ExportFile, SecretEntry, BackupError}`; `launcher_paths::module_data_file`; `crate::db`, `crate::utils::secret_store`.
- Produces:
  - `pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError>`
  - `pub fn import_data(input: ModuleImport, mode: ImportMode) -> Result<(), BackupError>`
  - rel_path convention: `db.sqlite`, `secrets.json` (`{ host_id: secret }`), `keys/<filename>`.

- [ ] **Step 1: Add the dependency**

In `modules/myssh/rust/Cargo.toml` `[dependencies]`, add:
```toml
launcher-backup = { path = "../../../crates/launcher-backup" }
```

- [ ] **Step 2: Write the failing round-trip test**

Create `modules/myssh/rust/src/backup.rs` with a test that seeds a temp DB + secret, exports, wipes, imports, and verifies. Because the module hard-codes its data dir via `launcher_paths`, the test drives the lower-level helpers it will share; put the DB-snapshot and secret-collection logic behind testable functions:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn snapshot_then_restore_db_bytes() {
        // snapshot a tiny in-memory-like db file
        let tmp = std::env::temp_dir().join(format!("myssh-bk-{}.db", std::process::id()));
        {
            let c = Connection::open(&tmp).unwrap();
            c.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);").unwrap();
        }
        let bytes = snapshot_db(&tmp).unwrap();
        std::fs::remove_file(&tmp).ok();
        restore_db(&tmp, &bytes).unwrap();
        let c = Connection::open(&tmp).unwrap();
        let x: i64 = c.query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, 42);
        std::fs::remove_file(&tmp).ok();
    }
}
```

- [ ] **Step 3: Run to confirm fail**

Run: `cargo test -p tauri-plugin-myssh backup::`
Expected: FAIL (`snapshot_db`/`restore_db` not defined).

- [ ] **Step 4: Implement `backup.rs`**
```rust
use launcher_backup::{BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const MODULE_ID: &str = "myssh";
const DB_NAME: &str = "myssh.db";

fn db_path() -> Result<PathBuf, BackupError> {
    launcher_paths::module_data_file(MODULE_ID, DB_NAME)
        .map_err(|e| BackupError::Io(format!("db path: {e}")))
}

/// Consistent single-file snapshot of a SQLite db via VACUUM INTO.
pub fn snapshot_db(src: &Path) -> Result<Vec<u8>, BackupError> {
    if !src.exists() {
        return Ok(Vec::new());
    }
    let out = std::env::temp_dir().join(format!("dl-snap-{}-{}.db", MODULE_ID, std::process::id()));
    let _ = std::fs::remove_file(&out);
    let conn = Connection::open(src).map_err(|e| BackupError::Db(e.to_string()))?;
    conn.execute("VACUUM INTO ?1", [out.to_string_lossy().to_string()])
        .map_err(|e| BackupError::Db(e.to_string()))?;
    let bytes = std::fs::read(&out)?;
    let _ = std::fs::remove_file(&out);
    Ok(bytes)
}

/// Overwrite the db file, clearing any stale WAL/SHM sidecars first.
pub fn restore_db(dst: &Path, bytes: &[u8]) -> Result<(), BackupError> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    for ext in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", dst.display(), ext));
        let _ = std::fs::remove_file(side);
    }
    std::fs::write(dst, bytes)?;
    Ok(())
}

fn collect_host_ids() -> Result<Vec<String>, BackupError> {
    let conn = crate::db::open().map_err(|e| BackupError::Db(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id FROM hosts")
        .map_err(|e| BackupError::Db(e.to_string()))?;
    let ids = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| BackupError::Db(e.to_string()))?
        .filter_map(Result::ok)
        .collect();
    Ok(ids)
}

fn collect_key_path_for(host_id: &str) -> Result<Option<String>, BackupError> {
    let conn = crate::db::open().map_err(|e| BackupError::Db(e.to_string()))?;
    conn.query_row("SELECT key_path FROM hosts WHERE id = ?1", [host_id], |r| r.get::<_, Option<String>>(0))
        .map_err(|e| BackupError::Db(e.to_string()))
}

pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();
    // DB
    let db = snapshot_db(&db_path()?)?;
    if !db.is_empty() {
        out.files.push(ExportFile { rel_path: "db.sqlite".into(), bytes: db });
    }
    // Secrets (per host_id, service `myssh`)
    for id in collect_host_ids()? {
        if let Some(secret) = crate::utils::secret_store::get_host_secret(&id)
            .map_err(|e| BackupError::Keyring(e.to_string()))?
        {
            out.secrets.push(SecretEntry { account: id.clone(), value: secret });
        }
        // Optional: bundle referenced key files
        if opts.include_heavy {
            if let Some(key_path) = collect_key_path_for(&id)? {
                let p = Path::new(&key_path);
                if p.is_file() {
                    if let Ok(bytes) = std::fs::read(p) {
                        let name = p.file_name().map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_else(|| format!("{id}.key"));
                        out.files.push(ExportFile { rel_path: format!("keys/{name}"), bytes });
                    }
                }
            }
        }
    }
    Ok(out)
}

pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    // DB
    if let Some(db) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        restore_db(&db_path()?, &db.bytes)?;
    }
    // Key files → module data dir `keys/`
    let keys_dir = launcher_paths::module_data_dir(MODULE_ID)
        .map_err(|e| BackupError::Io(e.to_string()))?
        .join("keys");
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("keys/")) {
        std::fs::create_dir_all(&keys_dir)?;
        let name = f.rel_path.trim_start_matches("keys/");
        std::fs::write(keys_dir.join(name), &f.bytes)?;
    }
    // Secrets → keyring (service `myssh`, account = host_id)
    for s in &input.secrets {
        crate::utils::secret_store::store_host_secret(&s.account, &s.value)
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }
    Ok(())
}
```
(If `hosts.key_path` column name differs, adjust the SQL to the actual column — verify against `modules/myssh/rust/src/db/migrations.rs` during implementation. Imported key files land in the module's own `keys/` dir; a follow-up nicety, out of v1 scope, is rewriting `hosts.key_path` to the new location.)

- [ ] **Step 5: Add `pub mod backup;` to `lib.rs`**

In `modules/myssh/rust/src/lib.rs`, add near the other `mod` declarations:
```rust
pub mod backup;
```

- [ ] **Step 6: Run the test**

Run: `cargo test -p tauri-plugin-myssh backup::`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add modules/myssh/rust
git commit -m "feat(myssh): export_data/import_data backup contract"
```

---

### Task 7: Open Sesame `export_data` / `import_data`

**Files:**
- Create: `modules/open-sesame/rust/src/backup.rs`
- Modify: `modules/open-sesame/rust/src/lib.rs`, `modules/open-sesame/rust/Cargo.toml`

**Interfaces:**
- Produces: `pub fn export_data(ExportOptions) -> Result<ModuleExport, BackupError>`, `pub fn import_data(ModuleImport, ImportMode) -> Result<(), BackupError>`.
- rel_path convention: `db.sqlite`, `secrets.json` accounts keyed `<provider>:<account_id>`, `mirrors/<id>/...` (optional).

- [ ] **Step 1: Add dep** — in `modules/open-sesame/rust/Cargo.toml`: `launcher-backup = { path = "../../../crates/launcher-backup" }`.

- [ ] **Step 2: Write the failing test** — same `snapshot_db`/`restore_db` round-trip as Task 6 Step 2 (this module reuses the identical helper; copy the test verbatim with module-appropriate temp name `os-bk`).

- [ ] **Step 3: Run to confirm fail** — `cargo test -p tauri-plugin-open-sesame backup::` → FAIL.

- [ ] **Step 4: Implement `backup.rs`**
```rust
use launcher_backup::{BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const MODULE_ID: &str = "open-sesame";

// snapshot_db / restore_db: identical to myssh::backup (DRY note: these two
// fns are the same everywhere — if a third copy appears, lift them into
// launcher-backup as `db::snapshot`/`db::restore` and depend on that).
pub fn snapshot_db(src: &Path) -> Result<Vec<u8>, BackupError> { /* identical body to Task 6 Step 4 */ unimplemented!() }
pub fn restore_db(dst: &Path, bytes: &[u8]) -> Result<(), BackupError> { /* identical body to Task 6 Step 4 */ unimplemented!() }

fn db_path() -> Result<PathBuf, BackupError> {
    Ok(crate::utils::paths::db_path().map_err(|e| BackupError::Io(e.to_string()))?)
}

pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();
    let db = snapshot_db(&db_path()?)?;
    if !db.is_empty() {
        out.files.push(ExportFile { rel_path: "db.sqlite".into(), bytes: db });
    }
    // Secrets: each accounts row's keyring token. The `accounts.token` column
    // holds `keyring:<provider>:<account_id>`; resolve to plaintext and key by
    // the `<provider>:<account_id>` account string.
    let conn = Connection::open(db_path()?).map_err(|e| BackupError::Db(e.to_string()))?;
    let mut stmt = conn.prepare("SELECT token FROM accounts").map_err(|e| BackupError::Db(e.to_string()))?;
    let refs: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| BackupError::Db(e.to_string()))?.filter_map(Result::ok).collect();
    for token_ref in refs {
        if let Some(account) = token_ref.strip_prefix("keyring:") {
            if let Ok(plain) = crate::utils::secret_store::resolve_token(&token_ref) {
                out.secrets.push(SecretEntry { account: account.to_string(), value: plain });
            }
        }
    }
    // Optional: mirror folders under ~/.open-sesame/mirrors/<id>/
    if opts.include_heavy {
        let mirrors = crate::utils::paths::mirrors_dir().map_err(|e| BackupError::Io(e.to_string()))?;
        collect_dir(&mirrors, "mirrors", &mut out.files)?;
    }
    Ok(out)
}

fn collect_dir(root: &Path, prefix: &str, files: &mut Vec<ExportFile>) -> Result<(), BackupError> {
    if !root.exists() { return Ok(()); }
    for entry in walk(root) {
        let rel = entry.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
        // skip the live .git internals' lock files but keep tree
        let bytes = std::fs::read(&entry)?;
        files.push(ExportFile { rel_path: format!("{prefix}/{rel}"), bytes });
    }
    Ok(())
}

fn walk(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() { stack.push(p); } else { out.push(p); }
            }
        }
    }
    out
}

pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    if let Some(db) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        restore_db(&db_path()?, &db.bytes)?;
    }
    // Restore mirrors
    let mirrors = crate::utils::paths::mirrors_dir().map_err(|e| BackupError::Io(e.to_string()))?;
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("mirrors/")) {
        let rel = f.rel_path.trim_start_matches("mirrors/");
        let dst = mirrors.join(rel);
        if let Some(parent) = dst.parent() { std::fs::create_dir_all(parent)?; }
        std::fs::write(dst, &f.bytes)?;
    }
    // Secrets: re-store under keyring service `open-sesame`, account = the stored string.
    for s in &input.secrets {
        keyring::Entry::new("open-sesame", &s.account)
            .and_then(|e| e.set_password(&s.value))
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }
    Ok(())
}
```
(Verify the exact `crate::utils::paths` fn names — `db_path`, `mirrors_dir` — against `modules/open-sesame/rust/src/utils/paths.rs` during implementation; the module doc lists both. Fill in `snapshot_db`/`restore_db` bodies from Task 6 Step 4 verbatim — do not leave `unimplemented!()`.)

- [ ] **Step 5: Add `pub mod backup;` to `lib.rs`.**
- [ ] **Step 6: Run** `cargo test -p tauri-plugin-open-sesame backup::` → PASS.
- [ ] **Step 7: Commit**
```bash
git add modules/open-sesame/rust
git commit -m "feat(open-sesame): export_data/import_data backup contract"
```

---

### Task 8: Comtor `export_data` / `import_data`

**Files:**
- Create: `modules/comtor/rust/src/backup.rs`
- Modify: `modules/comtor/rust/src/lib.rs`, `modules/comtor/rust/Cargo.toml`

**Interfaces:**
- rel_path: `db.sqlite`, `settings.json`, `secrets.json` (accounts `soniox_api_key`/`openai_api_key`), `audio/<meetingId>.webm` (optional).

- [ ] **Step 1: Add dep** — `launcher-backup = { path = "../../../crates/launcher-backup" }`.

- [ ] **Step 2: Write the failing test** — `snapshot_db`/`restore_db` round-trip (temp name `comtor-bk`).

- [ ] **Step 3: Run to confirm fail** — `cargo test -p tauri-plugin-comtor backup::` → FAIL.

- [ ] **Step 4: Implement `backup.rs`**
```rust
use launcher_backup::{BackupError, ExportFile, ExportOptions, ImportMode, ModuleExport, ModuleImport, SecretEntry};
use keyring::Entry;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const MODULE_ID: &str = "comtor";
const SERVICE: &str = "virtual_comtor";
const KEY_ACCOUNTS: [&str; 2] = ["soniox_api_key", "openai_api_key"];

pub fn snapshot_db(src: &Path) -> Result<Vec<u8>, BackupError> { /* identical body to Task 6 Step 4 */ unimplemented!() }
pub fn restore_db(dst: &Path, bytes: &[u8]) -> Result<(), BackupError> { /* identical body to Task 6 Step 4 */ unimplemented!() }

fn data_dir() -> Result<PathBuf, BackupError> {
    launcher_paths::module_data_dir(MODULE_ID).map_err(|e| BackupError::Io(e.to_string()))
}

pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError> {
    let mut out = ModuleExport::default();
    let dir = data_dir()?;
    // DB
    let db = snapshot_db(&dir.join("vcomtor.db"))?;
    if !db.is_empty() { out.files.push(ExportFile { rel_path: "db.sqlite".into(), bytes: db }); }
    // settings.json
    let settings = dir.join("settings.json");
    if settings.is_file() {
        out.files.push(ExportFile { rel_path: "settings.json".into(), bytes: std::fs::read(&settings)? });
    }
    // Secrets: two fixed keyring accounts
    for acct in KEY_ACCOUNTS {
        if let Ok(entry) = Entry::new(SERVICE, acct) {
            if let Ok(v) = entry.get_password() {
                out.secrets.push(SecretEntry { account: acct.into(), value: v });
            }
        }
    }
    // Optional audio
    if opts.include_heavy {
        let audio = dir.join("audio");
        if audio.is_dir() {
            for e in std::fs::read_dir(&audio)?.flatten() {
                let p = e.path();
                if p.is_file() {
                    let name = p.file_name().unwrap().to_string_lossy().to_string();
                    out.files.push(ExportFile { rel_path: format!("audio/{name}"), bytes: std::fs::read(&p)? });
                }
            }
        }
    }
    Ok(out)
}

pub fn import_data(input: ModuleImport, _mode: ImportMode) -> Result<(), BackupError> {
    let dir = data_dir()?;
    std::fs::create_dir_all(&dir)?;
    if let Some(db) = input.files.iter().find(|f| f.rel_path == "db.sqlite") {
        restore_db(&dir.join("vcomtor.db"), &db.bytes)?;
    }
    if let Some(s) = input.files.iter().find(|f| f.rel_path == "settings.json") {
        std::fs::write(dir.join("settings.json"), &s.bytes)?;
    }
    let audio = dir.join("audio");
    for f in input.files.iter().filter(|f| f.rel_path.starts_with("audio/")) {
        std::fs::create_dir_all(&audio)?;
        std::fs::write(audio.join(f.rel_path.trim_start_matches("audio/")), &f.bytes)?;
    }
    for s in &input.secrets {
        Entry::new(SERVICE, &s.account)
            .and_then(|e| e.set_password(&s.value))
            .map_err(|e| BackupError::Keyring(e.to_string()))?;
    }
    Ok(())
}
```
(Fill `snapshot_db`/`restore_db` from Task 6 verbatim.)

- [ ] **Step 5: Add `pub mod backup;` to `lib.rs`.**
- [ ] **Step 6: Run** `cargo test -p tauri-plugin-comtor backup::` → PASS.
- [ ] **Step 7: Commit**
```bash
git add modules/comtor/rust
git commit -m "feat(comtor): export_data/import_data backup contract"
```

---

## Phase 3 — Launcher host orchestrator

### Task 9: Auto-backup key (keyring, machine-bound)

**Files:**
- Create: `apps/launcher/src-tauri/src/backup/autokey.rs`
- Modify: `apps/launcher/src-tauri/Cargo.toml` (add `keyring`, `launcher-backup`, `getrandom`, `launcher-paths`, `rusqlite`? no — host needs only `keyring`, `launcher-backup`, `getrandom`, `launcher-paths`, `serde`/`serde_json`, the module crates already deps)

**Interfaces:**
- Produces: `fn get_or_create_autokey() -> Result<[u8; 32], BackupError>` (keyring service `desk-launcher`, account `backup-autokey`, base64/hex-stored 32 bytes).

- [ ] **Step 1: Add deps** — in `apps/launcher/src-tauri/Cargo.toml`:
```toml
launcher-backup = { path = "../../../crates/launcher-backup" }
keyring = "3"
getrandom = "0.2"
```
(Match the `keyring` major version the modules use — check `modules/myssh/rust/Cargo.toml`; use the same.)

- [ ] **Step 2: Write the failing test**
```rust
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
```

- [ ] **Step 3: Run to confirm fail** — `cargo test -p desk-launcher autokey::` → FAIL.

- [ ] **Step 4: Implement `autokey.rs`**
```rust
use launcher_backup::BackupError;

const SERVICE: &str = "desk-launcher";
const ACCOUNT: &str = "backup-autokey";

pub fn encode_key(key: &[u8; 32]) -> String {
    key.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn decode_key(s: &str) -> Result<[u8; 32], BackupError> {
    if s.len() != 64 { return Err(BackupError::Crypto("bad key length".into())); }
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
            getrandom::getrandom(&mut key).map_err(|e| BackupError::Crypto(e.to_string()))?;
            entry.set_password(&encode_key(&key)).map_err(|e| BackupError::Keyring(e.to_string()))?;
            Ok(key)
        }
        Err(e) => Err(BackupError::Keyring(e.to_string())),
    }
}
```

- [ ] **Step 5: Run** `cargo test -p desk-launcher autokey::` → PASS.
- [ ] **Step 6: Commit**
```bash
git add apps/launcher/src-tauri
git commit -m "feat(backup): machine-bound auto-backup key"
```

---

### Task 10: Host orchestrator + app commands

**Files:**
- Create: `apps/launcher/src-tauri/src/backup/mod.rs`
- Modify: `apps/launcher/src-tauri/src/lib.rs` (`mod backup;` + register commands)

**Interfaces:**
- Consumes: each module's `tauri_plugin_<id>::backup::{export_data, import_data}`; `launcher_backup::{write_bundle, read_bundle, BundleKey, BackupManifest, ModuleManifest, BackupType, ExportOptions, ImportMode, ModuleImport, ExportFile}`; `super::autokey`.
- Produces app commands:
  - `backup_plan() -> Vec<ModulePlan>` where `ModulePlan { id, label, has_data, heavy_label }`
  - `backup_export(app, req: ExportReq) -> Result<String, String>` (`ExportReq { selection: Vec<ModuleSel>, appearance: serde_json::Value, passphrase: String, dest_path: String }`, `ModuleSel { id, include_heavy }`)
  - `backup_preview(req: PreviewReq) -> Result<PreviewOut, String>`
  - `backup_import_apply(app, req: ApplyReq) -> Result<Vec<ModuleResult>, String>` returning `{ results, appearance }`.

- [ ] **Step 1: Map module id → export/import dispatch**

Create `apps/launcher/src-tauri/src/backup/mod.rs`:
```rust
mod autokey;

use launcher_backup::{
    read_bundle, write_bundle, BackupManifest, BackupType, BundleKey, ExportFile, ExportOptions,
    ImportMode, ModuleImport, ModuleManifest,
};
use serde::{Deserialize, Serialize};

const MODULES_WITH_DATA: &[&str] = &["myssh", "open-sesame", "comtor"];

fn export_module(id: &str, opts: ExportOptions) -> Result<launcher_backup::ModuleExport, String> {
    let r = match id {
        "myssh" => tauri_plugin_myssh::backup::export_data(opts),
        "open-sesame" => tauri_plugin_open_sesame::backup::export_data(opts),
        "comtor" => tauri_plugin_comtor::backup::export_data(opts),
        _ => return Err(format!("module {id} has no exportable data")),
    };
    r.map_err(|e| format!("{id}: {e}"))
}

fn import_module(id: &str, input: ModuleImport) -> Result<(), String> {
    let r = match id {
        "myssh" => tauri_plugin_myssh::backup::import_data(input, ImportMode::Replace),
        "open-sesame" => tauri_plugin_open_sesame::backup::import_data(input, ImportMode::Replace),
        "comtor" => tauri_plugin_comtor::backup::import_data(input, ImportMode::Replace),
        _ => return Err(format!("module {id} cannot import")),
    };
    r.map_err(|e| format!("{id}: {e}"))
}
```

- [ ] **Step 2: Add the request/response DTOs + `backup_plan`**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModulePlan { pub id: String, pub label: String, pub heavy_label: Option<String> }

#[tauri::command]
pub fn backup_plan() -> Vec<ModulePlan> {
    vec![
        ModulePlan { id: "myssh".into(), label: "MySSH".into(), heavy_label: Some("SSH key files".into()) },
        ModulePlan { id: "open-sesame".into(), label: "Open Sesame".into(), heavy_label: Some("Mirror folders".into()) },
        ModulePlan { id: "comtor".into(), label: "Virtual Comtor".into(), heavy_label: Some("Audio recordings".into()) },
        ModulePlan { id: "video-downloader".into(), label: "Media Toolbox".into(), heavy_label: None },
        ModulePlan { id: "md-converter".into(), label: "Markdown Converter".into(), heavy_label: None },
    ]
}
```

- [ ] **Step 3: Implement `backup_export`**

Appearance arrives from the frontend as a JSON object (`{ "theme:launcher": "...", ... }`); the host stores it as `launcher/appearance.json`. The whole set is encrypted with the user passphrase.
```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleSel { pub id: String, pub include_heavy: bool }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReq {
    pub selection: Vec<ModuleSel>,
    pub appearance: serde_json::Value,
    pub passphrase: String,
    pub dest_path: String,
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[tauri::command]
pub fn backup_export(req: ExportReq) -> Result<String, String> {
    if req.passphrase.trim().is_empty() {
        return Err("Passphrase is required".into());
    }
    let mut files: Vec<ExportFile> = Vec::new();
    let mut modules: Vec<ModuleManifest> = Vec::new();

    // Appearance (always included)
    let appearance_bytes = serde_json::to_vec(&req.appearance).map_err(|e| e.to_string())?;
    files.push(ExportFile { rel_path: "launcher/appearance.json".into(), bytes: appearance_bytes });

    for sel in &req.selection {
        if !MODULES_WITH_DATA.contains(&sel.id.as_str()) { continue; }
        let me = export_module(&sel.id, ExportOptions { include_heavy: sel.include_heavy })?;
        let mut count = 0usize;
        for f in me.files {
            files.push(ExportFile { rel_path: format!("{}/{}", sel.id, f.rel_path), bytes: f.bytes });
            count += 1;
        }
        if !me.secrets.is_empty() {
            let json = serde_json::to_vec(
                &me.secrets.iter().map(|s| (s.account.clone(), s.value.clone())).collect::<std::collections::BTreeMap<_, _>>()
            ).map_err(|e| e.to_string())?;
            files.push(ExportFile { rel_path: format!("{}/secrets.json", sel.id), bytes: json });
            count += 1;
        }
        modules.push(ModuleManifest { id: sel.id.clone(), include_heavy: sel.include_heavy, file_count: count });
    }

    let manifest = BackupManifest {
        version: 1,
        created_at_ms: now_ms(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backup_type: BackupType::Full,
        modules,
    };
    let bytes = write_bundle(&manifest, &files, BundleKey::Passphrase(&req.passphrase))
        .map_err(|e| e.to_string())?;
    std::fs::write(&req.dest_path, &bytes).map_err(|e| e.to_string())?;
    Ok(req.dest_path)
}
```

- [ ] **Step 4: Implement `backup_preview` + `backup_import_apply`**
```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReq { pub src_path: String, pub passphrase: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOut { pub version: u32, pub app_version: String, pub created_at_ms: u64, pub modules: Vec<PreviewModule> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewModule { pub id: String, pub include_heavy: bool, pub file_count: usize }

fn read_src(src: &str, pass: &str) -> Result<launcher_backup::ReadBundle, String> {
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    read_bundle(&bytes, BundleKey::Passphrase(pass)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_preview(req: PreviewReq) -> Result<PreviewOut, String> {
    let rb = read_src(&req.src_path, &req.passphrase)?;
    Ok(PreviewOut {
        version: rb.manifest.version,
        app_version: rb.manifest.app_version,
        created_at_ms: rb.manifest.created_at_ms,
        modules: rb.manifest.modules.into_iter()
            .map(|m| PreviewModule { id: m.id, include_heavy: m.include_heavy, file_count: m.file_count })
            .collect(),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReq { pub src_path: String, pub passphrase: String, pub selection: Vec<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleResult { pub id: String, pub ok: bool, pub error: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOut { pub results: Vec<ModuleResult>, pub appearance: serde_json::Value }

#[tauri::command]
pub fn backup_import_apply(app: tauri::AppHandle, req: ApplyReq) -> Result<ApplyOut, String> {
    use tauri::Manager;
    let rb = read_src(&req.src_path, &req.passphrase)?;

    // Appearance for the frontend to apply.
    let appearance = rb.files.iter()
        .find(|f| f.rel_path == "launcher/appearance.json")
        .and_then(|f| serde_json::from_slice(&f.bytes).ok())
        .unwrap_or(serde_json::Value::Null);

    let mut results = Vec::new();
    for id in &req.selection {
        // Close the module window to release DB locks.
        if let Some(w) = app.get_webview_window(id) { let _ = w.close(); }
        // Auto-backup the current data first.
        if let Err(e) = auto_backup_module(id) {
            results.push(ModuleResult { id: id.clone(), ok: false, error: Some(format!("auto-backup failed: {e}")) });
            continue;
        }
        // Assemble this module's ModuleImport from the bundle subtree.
        let prefix = format!("{id}/");
        let mut mi = ModuleImport::default();
        for f in rb.files.iter().filter(|f| f.rel_path.starts_with(&prefix)) {
            let rel = f.rel_path.trim_start_matches(&prefix);
            if rel == "secrets.json" {
                if let Ok(map) = serde_json::from_slice::<std::collections::BTreeMap<String, String>>(&f.bytes) {
                    for (account, value) in map {
                        mi.secrets.push(launcher_backup::SecretEntry { account, value });
                    }
                }
            } else {
                mi.files.push(ExportFile { rel_path: rel.to_string(), bytes: f.bytes.clone() });
            }
        }
        match import_module(id, mi) {
            Ok(()) => results.push(ModuleResult { id: id.clone(), ok: true, error: None }),
            Err(e) => results.push(ModuleResult { id: id.clone(), ok: false, error: Some(e) }),
        }
    }
    Ok(ApplyOut { results, appearance })
}

fn auto_backup_module(id: &str) -> Result<(), String> {
    let me = export_module(id, ExportOptions { include_heavy: true })?;
    let mut files = Vec::new();
    for f in me.files { files.push(ExportFile { rel_path: format!("{id}/{}", f.rel_path), bytes: f.bytes }); }
    if !me.secrets.is_empty() {
        let json = serde_json::to_vec(
            &me.secrets.iter().map(|s| (s.account.clone(), s.value.clone())).collect::<std::collections::BTreeMap<_, _>>()
        ).map_err(|e| e.to_string())?;
        files.push(ExportFile { rel_path: format!("{id}/secrets.json"), bytes: json });
    }
    let manifest = BackupManifest {
        version: 1, created_at_ms: now_ms(), app_version: env!("CARGO_PKG_VERSION").to_string(),
        backup_type: BackupType::Auto,
        modules: vec![ModuleManifest { id: id.into(), include_heavy: true, file_count: files.len() }],
    };
    let key = autokey::get_or_create_autokey().map_err(|e| e.to_string())?;
    let bytes = write_bundle(&manifest, &files, BundleKey::Raw(&key)).map_err(|e| e.to_string())?;
    let dir = launcher_paths::launcher_data_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("auto-{id}-{}.dlbak", now_ms()));
    std::fs::write(path, &bytes).map_err(|e| e.to_string())?;
    prune_auto_backups(&dir, id, 3);
    Ok(())
}

fn prune_auto_backups(dir: &std::path::Path, id: &str, keep: usize) {
    let prefix = format!("auto-{id}-");
    let mut entries: Vec<_> = std::fs::read_dir(dir).into_iter().flatten().flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with(&prefix)).unwrap_or(false))
        .collect();
    entries.sort();
    while entries.len() > keep {
        let old = entries.remove(0);
        let _ = std::fs::remove_file(old);
    }
}
```

- [ ] **Step 5: Register commands in `lib.rs`**

In `apps/launcher/src-tauri/src/lib.rs`: add `mod backup;` at the top, and extend `generate_handler!`:
```rust
.invoke_handler(tauri::generate_handler![
    window_manager::open_module,
    window_manager::close_module,
    window_manager::list_open_modules,
    module_registry::list_modules,
    backup::backup_plan,
    backup::backup_export,
    backup::backup_preview,
    backup::backup_import_apply,
])
```
Also move `mod autokey;` so it is a child of `backup` (declared inside `backup/mod.rs` as shown), not a top-level module.

- [ ] **Step 6: Build the host**

Run: `cargo build -p desk-launcher`
Expected: compiles (module crates expose `pub mod backup`). Fix any path/column mismatches surfaced here.

- [ ] **Step 7: Commit**
```bash
git add apps/launcher/src-tauri
git commit -m "feat(backup): host orchestrator + export/preview/import commands"
```

---

## Phase 4 — Launcher frontend

### Task 11: Backup API + appearance helpers

**Files:**
- Create: `apps/launcher/src/features/backup/backup-api.ts`

**Interfaces:**
- Produces: `backupPlan()`, `exportBackup(req)`, `previewBackup(req)`, `applyBackup(req)`, `gatherAppearance()`, `applyAppearance(obj)`.

- [ ] **Step 1: Implement `backup-api.ts`**
```ts
import { invoke } from '@tauri-apps/api/core'

export interface ModulePlan { id: string; label: string; heavyLabel: string | null }
export interface ModuleSel { id: string; includeHeavy: boolean }
export interface PreviewModule { id: string; includeHeavy: boolean; fileCount: number }
export interface PreviewOut { version: number; appVersion: string; createdAtMs: number; modules: PreviewModule[] }
export interface ModuleResult { id: string; ok: boolean; error: string | null }
export interface ApplyOut { results: ModuleResult[]; appearance: Record<string, string> | null }

export const backupPlan = () => invoke<ModulePlan[]>('backup_plan')

export const exportBackup = (req: {
  selection: ModuleSel[]; appearance: Record<string, string>; passphrase: string; destPath: string
}) => invoke<string>('backup_export', { req })

export const previewBackup = (req: { srcPath: string; passphrase: string }) =>
  invoke<PreviewOut>('backup_preview', { req })

export const applyBackup = (req: { srcPath: string; passphrase: string; selection: string[] }) =>
  invoke<ApplyOut>('backup_import_apply', { req })

/** Snapshot every app's saved theme from the shared localStorage origin. */
export function gatherAppearance(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('theme:')) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

/** Write an imported appearance snapshot back to localStorage. */
export function applyAppearance(obj: Record<string, string> | null): void {
  if (!obj) return
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('theme:')) localStorage.setItem(k, v)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix apps/launcher run build` (or `tsc -b`) up to type-check; expect no type errors in this file.

- [ ] **Step 3: Commit**
```bash
git add apps/launcher/src/features/backup/backup-api.ts
git commit -m "feat(backup): frontend api + appearance localStorage helpers"
```

---

### Task 12: Export wizard

**Files:**
- Create: `apps/launcher/src/features/backup/ExportWizard.tsx`

**Interfaces:**
- Consumes: `backup-api`, `@tauri-apps/plugin-dialog` `save`, `@desk-launcher/ui` `Button`/`Input`.
- Produces: `<ExportWizard onClose={() => void} />`.

- [ ] **Step 1: Implement `ExportWizard.tsx`**
```tsx
import { useEffect, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { Button } from '@desk-launcher/ui'
import { backupPlan, exportBackup, gatherAppearance, type ModulePlan } from './backup-api'

export function ExportWizard({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<ModulePlan[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [heavy, setHeavy] = useState<Record<string, boolean>>({})
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    backupPlan().then((p) => {
      setPlans(p)
      const all: Record<string, boolean> = {}
      const h: Record<string, boolean> = {}
      for (const m of p) { all[m.id] = true; if (m.heavyLabel) h[m.id] = true }
      setPicked(all); setHeavy(h)
    })
  }, [])

  const run = async () => {
    setMsg(null)
    if (!pass) return setMsg('Enter a passphrase.')
    if (pass !== confirm) return setMsg('Passphrases do not match.')
    const dest = await save({ title: 'Save backup', defaultPath: 'desk-launcher-backup.dlbak', filters: [{ name: 'Desk Launcher Backup', extensions: ['dlbak'] }] })
    if (!dest) return
    setBusy(true)
    try {
      const selection = plans.filter((m) => picked[m.id]).map((m) => ({ id: m.id, includeHeavy: !!heavy[m.id] }))
      await exportBackup({ selection, appearance: gatherAppearance(), passphrase: pass, destPath: dest })
      setMsg(`Saved to ${dest}`)
    } catch (e) {
      setMsg(`Export failed: ${String((e as { message?: string })?.message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Export backup</h3>
      <div className="space-y-2">
        {plans.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={!!picked[m.id]} onChange={(e) => setPicked((s) => ({ ...s, [m.id]: e.target.checked }))} />
              {m.label}
            </span>
            {m.heavyLabel && picked[m.id] && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!heavy[m.id]} onChange={(e) => setHeavy((s) => ({ ...s, [m.id]: e.target.checked }))} />
                {m.heavyLabel}
              </span>
            )}
          </label>
        ))}
      </div>
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Confirm passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={run} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `tsc -b` clean.
- [ ] **Step 3: Commit**
```bash
git add apps/launcher/src/features/backup/ExportWizard.tsx
git commit -m "feat(backup): export wizard UI"
```

---

### Task 13: Import wizard

**Files:**
- Create: `apps/launcher/src/features/backup/ImportWizard.tsx`

**Interfaces:**
- Consumes: `backup-api`, `@tauri-apps/plugin-dialog` `open`.
- Produces: `<ImportWizard onClose={() => void} />`.

- [ ] **Step 1: Implement `ImportWizard.tsx`**
```tsx
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@desk-launcher/ui'
import { applyAppearance, applyBackup, previewBackup, type ModuleResult, type PreviewOut } from './backup-api'

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [pass, setPass] = useState('')
  const [preview, setPreview] = useState<PreviewOut | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<ModuleResult[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    const f = await open({ multiple: false, filters: [{ name: 'Desk Launcher Backup', extensions: ['dlbak'] }] })
    if (typeof f === 'string') { setSrc(f); setPreview(null); setResults(null) }
  }

  const doPreview = async () => {
    if (!src || !pass) return setMsg('Pick a file and enter the passphrase.')
    setBusy(true); setMsg(null)
    try {
      const p = await previewBackup({ srcPath: src, passphrase: pass })
      setPreview(p)
      setPicked(Object.fromEntries(p.modules.map((m) => [m.id, true])))
    } catch {
      setMsg('Wrong passphrase or the file is damaged.')
    } finally { setBusy(false) }
  }

  const apply = async () => {
    if (!src || !preview) return
    setBusy(true); setMsg(null)
    try {
      const selection = preview.modules.filter((m) => picked[m.id]).map((m) => m.id)
      const out = await applyBackup({ srcPath: src, passphrase: pass, selection })
      applyAppearance(out.appearance)
      setResults(out.results)
    } catch (e) {
      setMsg(`Import failed: ${String((e as { message?: string })?.message ?? e)}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Import backup</h3>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={pick}>Choose .dlbak…</Button>
        <span className="truncate text-xs text-muted-foreground">{src ?? 'No file selected'}</span>
      </div>
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
      {!preview && <Button onClick={doPreview} disabled={busy || !src}>Preview</Button>}
      {preview && !results && (
        <>
          <p className="text-xs text-muted-foreground">From app v{preview.appVersion}. Importing replaces each selected module's data (a safety backup is made first).</p>
          <div className="space-y-1">
            {preview.modules.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!picked[m.id]} onChange={(e) => setPicked((s) => ({ ...s, [m.id]: e.target.checked }))} />
                {m.id} <span className="text-xs text-muted-foreground">({m.fileCount} files{m.includeHeavy ? ', full' : ''})</span>
              </label>
            ))}
          </div>
          <Button onClick={apply} disabled={busy}>{busy ? 'Importing…' : 'Import (replace)'}</Button>
        </>
      )}
      {results && (
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.id} className={r.ok ? 'text-emerald-400' : 'text-red-400'}>
              {r.id}: {r.ok ? 'restored' : r.error}
            </li>
          ))}
          <li className="text-xs text-muted-foreground">Reopen module windows to see restored data and theme.</li>
        </ul>
      )}
      {msg && <p className="text-xs text-red-400">{msg}</p>}
      <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `tsc -b` clean.
- [ ] **Step 3: Commit**
```bash
git add apps/launcher/src/features/backup/ImportWizard.tsx
git commit -m "feat(backup): import wizard UI"
```

---

### Task 14: Mount Backup panel in launcher Settings

**Files:**
- Create: `apps/launcher/src/features/backup/BackupPanel.tsx`
- Modify: `apps/launcher/src/pages/Dashboard.tsx` (`SettingsModal`), `apps/launcher/src-tauri/capabilities/launcher.json`

- [ ] **Step 1: Implement `BackupPanel.tsx`** (tabbed Export/Import)
```tsx
import { useState } from 'react'
import { ExportWizard } from './ExportWizard'
import { ImportWizard } from './ImportWizard'

export function BackupPanel() {
  const [tab, setTab] = useState<'export' | 'import'>('export')
  return (
    <section className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button className={tab === 'export' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setTab('export')}>Export</button>
        <button className={tab === 'import' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setTab('import')}>Import</button>
      </div>
      {tab === 'export' ? <ExportWizard onClose={() => {}} /> : <ImportWizard onClose={() => {}} />}
    </section>
  )
}
```

- [ ] **Step 2: Mount in `SettingsModal`** — in `apps/launcher/src/pages/Dashboard.tsx`, import and render `<BackupPanel/>` below `<ThemePicker/>` inside `SettingsModal` (add a section heading "Backup"):
```tsx
import { BackupPanel } from '../features/backup/BackupPanel'
// ...inside SettingsModal, after the appearance section:
<div className="mt-6 border-t pt-4">
  <BackupPanel />
</div>
```

- [ ] **Step 3: Grant dialog permissions** — in `apps/launcher/src-tauri/capabilities/launcher.json`, extend `permissions`:
```json
    "core:default",
    "opener:default",
    "log:default",
    "dialog:default",
    "dialog:allow-save",
    "dialog:allow-open"
```

- [ ] **Step 4: Manual smoke run**

Run: `npm run dev` (repo root). In the launcher, open Settings → Backup → Export: pick modules, set a passphrase, save a `.dlbak`. Then Import that file with the same passphrase and confirm the results list shows each module "restored". Confirm wrong passphrase shows the friendly error.

- [ ] **Step 5: Commit**
```bash
git add apps/launcher/src/features/backup/BackupPanel.tsx apps/launcher/src/pages/Dashboard.tsx apps/launcher/src-tauri/capabilities/launcher.json
git commit -m "feat(backup): mount Backup panel in launcher Settings"
```

---

## Phase 5 — Integration test + docs

### Task 15: Host integration round-trip test

**Files:**
- Create: `apps/launcher/src-tauri/tests/backup_roundtrip.rs`

- [ ] **Step 1: Write an integration test** that drives the pure pieces end-to-end without a running window: build a `ModuleExport` with fake files+secrets, assemble a bundle via `launcher_backup::write_bundle` with a passphrase, read it back, and assert the per-module subtree + `secrets.json` reassemble into a `ModuleImport` with matching contents. (This exercises the same assembly/disassembly logic as `backup_export`/`backup_import_apply` without the keyring/DB side effects.)
```rust
use launcher_backup::*;

#[test]
fn export_assemble_then_reassemble() {
    let files = vec![
        ExportFile { rel_path: "myssh/db.sqlite".into(), bytes: vec![1, 2, 3] },
        ExportFile { rel_path: "myssh/secrets.json".into(), bytes: br#"{"host-1":"pw"}"#.to_vec() },
        ExportFile { rel_path: "launcher/appearance.json".into(), bytes: br#"{"theme:launcher":"{}"}"#.to_vec() },
    ];
    let manifest = BackupManifest {
        version: 1, created_at_ms: 1, app_version: "test".into(),
        backup_type: BackupType::Full,
        modules: vec![ModuleManifest { id: "myssh".into(), include_heavy: false, file_count: 2 }],
    };
    let bytes = write_bundle(&manifest, &files, BundleKey::Passphrase("pw")).unwrap();
    let rb = read_bundle(&bytes, BundleKey::Passphrase("pw")).unwrap();
    let secrets = rb.files.iter().find(|f| f.rel_path == "myssh/secrets.json").unwrap();
    let map: std::collections::BTreeMap<String, String> = serde_json::from_slice(&secrets.bytes).unwrap();
    assert_eq!(map.get("host-1").unwrap(), "pw");
    assert!(rb.files.iter().any(|f| f.rel_path == "launcher/appearance.json"));
}
```

- [ ] **Step 2: Run** `cargo test -p desk-launcher --test backup_roundtrip` → PASS.
- [ ] **Step 3: Commit**
```bash
git add apps/launcher/src-tauri/tests
git commit -m "test(backup): host bundle assemble/reassemble round-trip"
```

---

### Task 16: Update module docs (do-task Step 7)

**Files:**
- Modify: `desk-launcher-docs/modules/07-shared-infra.md` (new `crates/launcher-backup` section + Consumed-by), `01-launcher-host.md` (backup commands + Settings panel + new capability perms), `02-myssh.md`/`03-open-sesame.md`/`04-comtor.md` (each gains an `export_data`/`import_data` note + key files/mirror/audio backup mention), `00-index.md` (launcher-backup in module-07 entry; backup feature in host entry). Refresh each footer's `Synced:`.

- [ ] **Step 1: Update `07-shared-infra.md`** — add a `## RUST CRATES` subsection for `launcher-backup` (types + crypto + tar; consumed by host + myssh/open-sesame/comtor); add it to the Consumed-by table.

- [ ] **Step 2: Update `01-launcher-host.md`** — add the four `backup_*` host commands to the HOST COMMANDS table; note the Settings modal now also hosts the Backup panel; add `dialog:allow-save`/`allow-open` to the launcher capability row.

- [ ] **Step 3: Update `02/03/04` module docs** — one line under BACKEND FILES / NOTES: "`backup.rs` — `export_data`/`import_data` for launcher-wide backup (DB snapshot via VACUUM INTO + keyring secrets + [key files|mirrors|audio])."

- [ ] **Step 4: Update `00-index.md`** — module-07 entry lists `launcher-backup`; launcher entry mentions Backup export/import. Refresh all touched footers to the new HEAD commit.

- [ ] **Step 5: Commit**
```bash
git add desk-launcher-docs/modules
git commit -m "docs: document launcher backup export/import"
```

---

## Self-Review

**Spec coverage:**
- §2.1 shared crate → Tasks 1–5. §2.2 per-module contract → Tasks 6–8. §2.3 host commands → Tasks 9–10. §2.4 frontend + appearance → Tasks 11–14. §3 bundle format → Tasks 3–5. §4 matrix (heavy default ON) → export wizard defaults (Task 12) + per-module `include_heavy` (Tasks 6–8). §5 import flow (preview, auto-backup, close window, replace) → Task 10. §6 auto-backup machine-bound key → Task 9 + `auto_backup_module` (Task 10). §7 error handling → friendly wrong-passphrase (crypto), per-module results (Task 10), required passphrase (Task 10/12). §8 testing → unit tests across Tasks 2–9, integration Task 15, manual Task 14. Docs → Task 16. **No gaps.**

**Placeholder scan:** Two `unimplemented!()` markers in Tasks 7 & 8 are explicitly flagged "fill from Task 6 Step 4 verbatim" (the `snapshot_db`/`restore_db` bodies are identical and printed in full in Task 6) — the implementer copies real code, not a placeholder. Note added there to lift the pair into the crate if a fourth copy appears (DRY). No `TBD`/`TODO`.

**Type consistency:** `ExportOptions { include_heavy }`, `ModuleExport { files, secrets }`, `SecretEntry { account, value }`, `ExportFile { rel_path, bytes }`, `ImportMode::Replace`, `BundleKey::{Passphrase, Raw}`, `write_bundle`/`read_bundle`/`ReadBundle` are used identically across crate, modules, and host. Command DTOs (`ExportReq`/`PreviewReq`/`ApplyReq`) match the frontend `backup-api.ts` shapes (camelCase via serde rename + the `{ req }` invoke arg). Consistent.

**Risks to verify during implementation (flagged in spec §11):**
1. `hosts` column name for the SSH key path (`key_path` vs `keyPath`) — confirm in `migrations.rs`.
2. `crate::utils::paths` fn names in Open Sesame (`db_path`, `mirrors_dir`) — confirm.
3. `keyring` crate major version — match the modules' version in the host Cargo.toml.
4. localStorage shared-origin across windows — confirm at Task 14 smoke run; if isolated, gather appearance per-window instead.
