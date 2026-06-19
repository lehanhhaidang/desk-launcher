# Launcher Backup — Export / Import Design Spec

**Date:** 2026-06-19
**Status:** Approved (design)
**Goal:** A launcher-level **encrypted backup** feature: pick modules + what to include, produce one encrypted `.dlbak` file containing each module's database, secrets, files, and appearance; import restores everything onto a new or existing machine (replace per module, with an automatic safety backup first).

---

## 1. Purpose & scope

**Primary use case:** *personal full backup + migrate to a new machine.* The exported file is a complete, self-contained restore of the user's setup — including secrets (passwords, OAuth tokens, API keys, SSH key files). It is always encrypted with a user passphrase.

**Out of scope (v2+):** sharing config without secrets (template/redact), cloud sync, selective/partial restore below module granularity, merge-on-import.

**v1 covers all six surfaces:** the launcher itself + the five modules (MySSH, Open Sesame, Comtor, Video Downloader, MD Converter).

### Key constraints discovered (verified against code)
- **Secrets are not in the SQLite DBs** — they live in the OS keyring, but are **enumerable per-module** because each DB holds the keys:
  - MySSH — service `myssh`, account = each `host_id` (from `hosts` rows). `modules/myssh/rust/src/utils/secret_store.rs`.
  - Open Sesame — service `open-sesame`, account = `<provider>:<account_id>` (from `accounts` rows). `modules/open-sesame/rust/src/utils/secret_store.rs`.
  - Comtor — service `virtual_comtor`, fixed accounts `soniox_api_key` / `openai_api_key`. `modules/comtor/rust/src/settings.rs`.
  → A correct export gathers secrets via **per-module logic**, never by copying `.db` files.
- **Appearance lives in `localStorage["theme:<appId>"]`**, not on disk. All windows share one origin, so the launcher *frontend* can read/write every app's theme. Appearance export/import is therefore **frontend-driven**, not Rust.
- **MySSH key files** are referenced by path (`hosts.keyPath`) on the user's disk, not stored in the module — "export the keys" means reading those external files into the bundle.
- **The launcher host owns no storage** today (`apps/launcher/src-tauri/src/lib.rs` registers 4 window commands only). Backup is a new host capability.

---

## 2. Architecture

Three layers + one shared crate. The guiding rule: **each module owns the knowledge of its own data** (DB path, keyring service/keys, file dirs); the launcher owns orchestration, crypto, and UI.

### 2.1 Shared crate `crates/launcher-backup`
Holds the cross-cutting definitions so modules don't re-implement anything:
- **Types:** `ModuleExport`, `ModuleImport`, `ExportFile`, `SecretEntry`, `ExportOptions`, `ImportMode`, `BackupManifest`, `BackupError`.
- **Crypto:** passphrase → key derivation (Argon2id) → authenticated encryption (XChaCha20-Poly1305); plus a keyring-key variant for auto-backups.
- **Archive:** tar assembly/extraction of the in-memory payload tree.

Module crates depend on this crate **only for the types**. The host depends on it for everything.

```rust
// launcher-backup types (sketch)
pub struct ExportFile { pub rel_path: String, pub bytes: Vec<u8> }
pub struct SecretEntry { pub account: String, pub value: String } // service = the module's own
pub struct ModuleExport { pub files: Vec<ExportFile>, pub secrets: Vec<SecretEntry> }
pub struct ModuleImport { pub files: Vec<ExportFile>, pub secrets: Vec<SecretEntry> }
pub struct ExportOptions { pub include_heavy: bool } // semantics defined per module (keys/mirror/audio)
pub enum ImportMode { Replace }
```

### 2.2 Per-module Rust contract
Each `tauri-plugin-<id>` crate gains two **plain public functions** (not Tauri commands — the host crate already depends on every module crate by Cargo path, so it calls them in-process; plain fns are the right seam and are unit-testable):

```rust
pub fn export_data(opts: ExportOptions) -> Result<ModuleExport, BackupError>;
pub fn import_data(input: ModuleImport, mode: ImportMode) -> Result<(), BackupError>;
```

- `export_data` reads the module's own DB file, gathers its keyring secrets (iterating the keys it knows from its DB), and collects its files; returns them in memory. Secrets are returned **plaintext, in RAM only** — never written unencrypted to disk.
- `import_data(Replace)` overwrites the module's DB file, re-stores secrets into the keyring, and restores files. It assumes the module's window is closed (no DB lock).
- Modules with no persistent data (Video Downloader, MD Converter) implement trivial no-op versions (their appearance is handled at the frontend layer).

### 2.3 Launcher host orchestrator — `apps/launcher/src-tauri/src/backup/`
New host commands (registered in `lib.rs`):

| Command | Params | Job |
|---|---|---|
| `backup_plan` | — | Return the capability matrix (which modules have data, optional-item sizes) to drive the UI. |
| `backup_export` | `{ selection, options, appearance, passphrase, dest_path }` | Call each selected module's `export_data`; write `appearance.json` from the frontend-supplied snapshot; assemble manifest + payload tar; encrypt; write `.dlbak`. |
| `backup_preview` | `{ src_path, passphrase }` | Decrypt + validate manifest; return preview (modules, options, app version, item counts) — **does not apply**. |
| `backup_import_apply` | `{ src_path, passphrase, selection }` | Auto-backup current data; close each target module's window; per module `import_data(Replace)`; return per-module results + the appearance snapshot for the frontend to apply. |

The host **never** reads another module's DB schema or keyring layout — it only calls the module's `export_data`/`import_data` and moves opaque bytes/secrets.

### 2.4 Frontend (launcher window)
A **Backup** panel in the launcher Settings modal (beside Appearance/`ThemePicker`).
- **Appearance is frontend-owned:** on export, read every `localStorage["theme:*"]` key into an `appearance` object passed to `backup_export`; on import-apply, write the returned snapshot back to `localStorage` (module windows pick it up on next open / re-apply).
- **Export wizard:** select modules (checkboxes) → per-module optional toggles (default ON) → enter passphrase (with confirm) → save dialog → progress → done.
- **Import wizard:** pick `.dlbak` → enter passphrase → `backup_preview` shows what's inside → select modules to restore → confirm (warns about replace + auto-backup) → `backup_import_apply` → per-module result.

---

## 3. Bundle format (`.dlbak`)

```
[ magic "DLBAK1" ][ kdf params ][ salt 16B ][ nonce 24B ][ AEAD ciphertext ]
                                                              │
   plaintext (before encryption) = tar of:                   ▼
     manifest.json                       # version, created_at, app_version, type(full|auto),
                                          #   modules[], per-module options, sha256 per file
     launcher/appearance.json            # snapshot of all theme:* localStorage keys
     myssh/db.sqlite
     myssh/secrets.json                  # { host_id: secret }   (keyring, in-blob only)
     myssh/keys/<filename>               # optional (include_heavy) — referenced SSH key files
     open-sesame/db.sqlite
     open-sesame/secrets.json            # { "<provider>:<account_id>": token }
     open-sesame/mirrors/<id>/…          # optional (include_heavy) — mirror working copies
     comtor/db.sqlite
     comtor/secrets.json                 # { soniox_api_key, openai_api_key }
     comtor/settings.json
     comtor/audio/<meetingId>.webm       # optional (include_heavy)
```

- **KDF:** Argon2id over the user passphrase → 256-bit key. Salt random per export, stored in the header. Argon2 parameters stored in the header for forward-compat.
- **Cipher:** XChaCha20-Poly1305, single AEAD seal over the whole tar (tamper-evident; wrong passphrase → auth failure). Nonce random, in the header. The magic + KDF params + salt + nonce are authenticated as associated data.
- `secrets.json` files exist **only inside** the encrypted blob.
- Per-file SHA-256 in the manifest for integrity reporting on import.

---

## 4. Per-module export matrix (v1)

| Surface | Always included | Optional `include_heavy` (default **ON**) |
|---|---|---|
| Launcher | appearance (`theme:launcher`) | — |
| **MySSH** | `myssh.db` + keyring secrets (per host) + appearance | **SSH key files** (read from each `hosts.keyPath`) |
| **Open Sesame** | `data.db` + GitHub token + appearance | **mirror folders** (`~/.open-sesame/mirrors/<id>/`) |
| **Comtor** | `vcomtor.db` + Soniox/OpenAI keys + `settings.json` + appearance | **audio `.webm`** files |
| Video Downloader | appearance only | — |
| MD Converter | appearance only | — |

The "framework" (DB + secrets + appearance) is always on for a selected module. The heavy/optional item defaults **ON** (complete backup) and can be toggled off to shrink the bundle or omit external key files. Appearance is gathered once for all apps (single `localStorage` origin).

---

## 5. Import flow & safety

1. Pick `.dlbak` + passphrase → `backup_preview` decrypts + validates the manifest → UI shows modules, options, source app version, item counts.
2. User selects which modules to restore.
3. **Auto-backup first:** the host writes a timestamped backup of the *current* data for each target module before overwriting (see §6).
4. **Close windows:** the host closes each target module's window (`close_module`) to release SQLite/WAL locks.
5. Per module `import_data(Replace)`: replace the DB file, re-store secrets into the keyring, restore files/mirrors/audio/key-files.
6. The frontend applies the returned appearance snapshot to `localStorage`.
7. Per-module success/fail report. If a module fails, its auto-backup is left intact for manual recovery.

**App-version skew:** a bundle from a newer app version → warn but allow; each module already runs its own migrations on next open, so an older DB restored into a newer app migrates forward naturally.

---

## 6. Auto-backup (best-practice, machine-bound)

The pre-import safety copy must be recoverable **on the same machine without a passphrase**, yet never stored as plaintext:
- On first use, generate a random 32-byte **auto-backup key** and store it in the OS keyring (service `desk-launcher`, account `backup-autokey`).
- Auto-backups use the **same `.dlbak` AEAD format**, but the key comes from the keyring instead of a passphrase-derived KDF (`manifest.type = "auto"`, `kdf = "keyring"`).
- Stored under the launcher data dir (`%APPDATA%\io.desklauncher\backups\auto-<module>-<timestamp>.dlbak`), with a small retention cap (e.g. keep last N per module).

This is machine-bound (the keyring entry doesn't travel), so an auto-backup is not a migration artifact — it is purely local rollback. User-initiated exports always use a passphrase and remain portable.

---

## 7. Error handling

- **Wrong passphrase / corruption** → AEAD auth failure → "Wrong passphrase or the file is damaged."
- **Export, one module fails** → abort the whole export; do not leave a partial `.dlbak`; report which module failed.
- **Import, one module fails** → that module's auto-backup is preserved; remaining modules are aborted (fail-safe) and the partial state is reported, so the user can re-run or restore from auto-backup. (Conservative default; per-module continue could be a later option.)
- **Keyring write failure on import** → reported per secret; the DB/files still restore so the user can re-enter affected secrets.
- **Open module window during import** → host closes it first; if close fails, that module is skipped with a clear message.

---

## 8. Testing strategy

- **Unit (`crates/launcher-backup`):** crypto round-trip (encrypt→decrypt); wrong-passphrase fails; tampered ciphertext fails; manifest (de)serialize; tar assemble/extract.
- **Unit (each module):** `export_data` → `import_data(Replace)` round-trip against a temp data dir + a mocked/temporary keyring; verify DB rows, secrets, and files match.
- **Integration (host):** full `backup_export` → `backup_preview` → `backup_import_apply` round-trip on a seeded data dir; replace wipes+restores; auto-backup created; selection subset works.
- **Manual:** real Windows keyring; export on machine/profile A, import on profile B; large bundle with mirrors + audio; appearance round-trips via `localStorage`.

---

## 9. Components summary (units & responsibilities)

| Unit | Responsibility | Depends on |
|---|---|---|
| `crates/launcher-backup` | Types, crypto (Argon2id + XChaCha20-Poly1305), tar, manifest | argon2, chacha20poly1305, tar, serde, getrandom |
| `tauri-plugin-<id>::export_data/import_data` | Gather/restore that module's DB + secrets + files | launcher-backup (types), launcher-paths, keyring, rusqlite |
| `apps/launcher/.../backup/` (host) | Orchestrate, encrypt, write/read `.dlbak`, auto-backup, window close | launcher-backup, all module crates, keyring, dialog/fs |
| Launcher Backup panel (frontend) | Wizards, appearance localStorage gather/apply, progress/results | tauri invoke, theme localStorage |

---

## 10. Recommended dependencies (Rust)
`argon2`, `chacha20poly1305` (XChaCha20-Poly1305), `tar`, `getrandom`/`rand`, `sha2`, plus the existing `keyring`, `rusqlite`, `serde`/`serde_json`, `launcher-paths`. (All pure-Rust; no NASM/aws-lc concerns, consistent with the project's `ring`-only stance in MySSH.)

---

## 11. Open considerations (flagged, resolved in plan)
- **Keyring enumeration** relies on each module's DB holding the secret keys (verified for myssh/open-sesame/comtor). A keyring entry with no corresponding DB row would not be found — acceptable, since the live secrets are exactly the referenced ones.
- **Appearance shared-origin** assumption (one `localStorage` across windows) to be confirmed empirically during implementation; if windows turn out isolated, fall back to per-window appearance gather via a tiny module-side hook.
- **Capability/permissions:** the launcher window needs `dialog:allow-save`/`allow-open` and `fs` scope for the chosen `.dlbak` path; the host already has `fs`/`dialog` plugins registered. New capability entries scoped to the backup path.
- **Per-module `ExportOptions`:** modeled as a single `include_heavy` flag per module for v1 (semantics defined by each module). If a module later needs multiple optional axes, widen the struct.
```
