# MODULE: SHARED PACKAGES & INFRASTRUCTURE

## OVERVIEW
This is **not a business domain** — it is the cross-cutting foundation that every business module (MySSH, Open Sesame, Comtor, Video Downloader, MD Converter) builds on. It comprises the shared React UI primitives (`packages/ui`), the Tauri/HTTP bridge helper (`packages/tauri-bridge`), the **shared theme engine** (`packages/theme`), the `launcher-paths` Rust crate that hands each module its own isolated data directory under `%APPDATA%\io.desklauncher\`, and the build/sidecar tooling (`scripts/ensure-sidecars.mjs`, workspace wiring in root `package.json` / `Cargo.toml` / `vite.config.ts`). It is the concrete realization of the README rule: *"Modules never talk to each other. Shared code goes in `packages/` (frontend) or `crates/` (Rust)."*

---

## KEY FEATURES
- **Shared UI primitives**: shadcn/Radix-based React components (Button, Input, Card, Badge, Select, Tabs, LoadingSpinner) plus the `cn` class-merge util and a central `theme.css`, exported from one barrel and consumed via the `@desk-launcher/ui` alias.
- **Tauri/HTTP bridge**: `@desk-launcher/tauri-bridge` provides `apiRequest`, `apiDownload`, and a runtime-detected `API_BASE_URL` (Tauri host vs. browser dev) for talking to a local backend.
- **Shared theme engine**: `@desk-launcher/theme` — dark/light/system mode, a custom accent (auto-derived dual-tone), page-background blend, plus font/size/corner-radius/reduced-motion. Each app themes **itself** via its own `appId` (`localStorage["theme:"+appId]`), with token defaults + a shadcn bridge in `theme.css`. No launcher-as-master broadcast, so a module stays extractable as a standalone app.
- **Per-module data isolation**: the `launcher-paths` crate resolves `%APPDATA%\io.desklauncher\modules\<id>\` for any module by id, auto-creating the dir on first use — consumed by **every** Rust module that persists state.
- **Sidecar provisioning**: `scripts/ensure-sidecars.mjs` downloads `yt-dlp.exe` and `ffmpeg.exe` into the launcher's `binaries/` dir with a target-triple suffix before `npm run dev`/`build` (gated by `SKIP_SIDECARS`).
- **Source-only packages via aliases**: the two frontend packages have no `package.json`; they are wired into the launcher build purely through Vite path aliases, and their peer libs live in `apps/launcher/package.json`.

---

## FRONTEND PACKAGES

### `@desk-launcher/ui` (`packages/ui/src/`)
Barrel: `index.ts`. All components are shadcn-style, built on `radix-ui` + `class-variance-authority`, and styled with Tailwind classes merged through `cn`. Consumed via the Vite alias `@desk-launcher/ui` → `packages/ui/src`.

| Export | File | Description |
|---|---|---|
| `cn` | `utils.ts` | `twMerge(clsx(...))` class-name combiner used by every component. |
| `Button`, `buttonVariants` | `components/button.tsx` | CVA button; variants (default/destructive/outline/secondary/ghost/link) and sizes (default/xs/sm/lg + icon variants); `asChild` via Radix `Slot`. |
| `Input` | `components/input.tsx` | Styled native `<input>` wrapper. |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | `components/card.tsx` | Card layout primitives. (`CardAction` is defined in-file but **not** re-exported from the barrel.) |
| `Badge` | `components/badge.tsx` | CVA pill/badge with default/secondary/destructive/outline/ghost/link variants; `asChild`. |
| `LoadingSpinner` | `components/loading-spinner.tsx` | Spinner with `size` prop `'sm' \| 'md' \| 'lg'`. |
| `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectSeparator`, `SelectTrigger`, `SelectValue` | `components/select.tsx` | Radix Select wrappers (scroll buttons defined internally; not exported from barrel). |
| `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` | `components/tabs.tsx` | Radix Tabs wrappers; `TabsList` supports `default`/`line` variants. |

Plus a non-JS asset: **`theme.css`** — imports Tailwind, `tw-animate-css`, `shadcn/tailwind.css`, and the full Quicksand font family (Latin + Latin-ext + Vietnamese weights), and declares the `@theme` design tokens. Loaded centrally so every module window inherits the same look; pulled in by the launcher's `main.css`.

### `@desk-launcher/tauri-bridge` (`packages/tauri-bridge/src/`)
Barrel: `index.ts`. Thin `fetch` wrappers around a local backend. Consumed via the Vite alias `@desk-launcher/tauri-bridge` → `packages/tauri-bridge/src`.

| Export | File | Description |
|---|---|---|
| `API_BASE_URL` | `api-client.ts` | Resolved at load: `http://127.0.0.1:8000` when `__TAURI_INTERNALS__` is present (running inside the Tauri webview), else `VITE_API_URL` or `http://localhost:8000` for browser dev. |
| `apiRequest<T>(endpoint, options?)` | `api-client.ts` | Generic JSON request (`method`, `body`, `signal`, `headers`); sets `Content-Type: application/json` when a body is present; throws `Error(detail)` on non-2xx. |
| `apiDownload(endpoint, body, signal?)` | `api-client.ts` | POSTs JSON and returns `{ blob, filename }`, parsing `filename` from the `Content-Disposition` header (fallback `'download'`). |

### `@desk-launcher/theme` (`packages/theme/src/`)
The shared, self-contained **theme engine**. Each app themes itself independently (no cross-window broadcast), so a module stays extractable as a standalone app. Source-only; consumed via the Vite + tsconfig alias `@desk-launcher/theme` → `packages/theme/src`. Depends only on React + the DOM.

| File | Description |
|---|---|
| `tokens.ts` | `ThemeConfig` type + `DEFAULT_THEME` (the current "Aurora" look) + `ACCENT_PRESETS` (6 swatches). `ThemeConfig = { mode: dark\|light\|system, accent (hex/oklch), font: quicksand\|system\|mono, fontSize: sm\|md\|lg, radius (rem), reduceMotion, background: aurora\|vivid\|flat }`. |
| `resolve.ts` | Pure, **unit-tested** (`resolve.test.ts`): minimal hex→OKLCH, `deriveAccents` (secondary accent = primary hue **+110°**), `resolveMode` (system→`matchMedia`), and `resolve(cfg)` → a CSS-var record (`--brand`, `--brand-2`, `--radius`, `--font-sans`) + root font-size + background. |
| `apply.ts` | `applyTheme(cfg)` writes the vars onto `document.documentElement`, toggles `.dark`, sets the `data-bg` + `data-reduce-motion` attributes + root `font-size`. `applyThemeFromStorage(appId)` is the pre-render (no-FOUC) call. |
| `storage.ts` | `loadTheme(appId)` / `saveTheme(appId, cfg)` over `localStorage["theme:"+appId]`, merged onto `DEFAULT_THEME`; never throws. |
| `provider.tsx` | `ThemeProvider({ appId, children })` React context — loads+applies on mount, re-applies + persists on change, follows the OS scheme while `mode === 'system'`; exposes `useTheme() → { theme, setTheme, reset }`. |
| `ThemePicker.tsx` | The controls: mode / accent (6 presets + free color input) / background / font / text-size / radius slider (0–1.5rem) / reduce-motion / Reset — every change applies live. |
| `AppearanceButton.tsx` | Drop-in palette button opening a `<ThemePicker>` popover **portaled to `<body>`** (so a `transform`/`backdrop-filter` ancestor can't clip it). Used by module headers/sidebars. |
| `index.ts` | Barrel: `ThemeProvider`, `useTheme`, `ThemePicker`, `AppearanceButton`, `applyTheme`/`applyThemeFromStorage`, `loadTheme`/`saveTheme`, `resolve` helpers, `DEFAULT_THEME`, `ACCENT_PRESETS`, types. |

**Token bridge + wiring:** token defaults (dark + light) live in `packages/ui/src/theme.css`, which also redefines the shadcn variables (`--background`, `--primary`, `--border`, …) in terms of the brand tokens — so `@desk-launcher/ui` components recolor with the theme too. Each app wires it at its window entry (`main.tsx`): `applyThemeFromStorage('<appId>')` **before** `createRoot().render()`, then wraps in `<ThemeProvider appId="<appId>">`. appIds in use: `launcher`, `myssh`, `open-sesame`, `comtor`, `video-downloader`, `md-converter`.

---

## RUST CRATES

### `launcher-paths` (`crates/launcher-paths/`)
A tiny, dependency-light crate (`dirs = "5"`, workspace `thiserror`) whose entire job is to resolve per-module data directories consistently. Source: `src/lib.rs` (63 lines, all of it below). It exists so modules **do not** hard-code their own bundle identifier or call `app.path().app_data_dir()` directly — doing so would scatter their databases into folders separate from the rest of the launcher.

| Public item | Signature | Description |
|---|---|---|
| `LAUNCHER_IDENTIFIER` | `pub const &str = "io.desklauncher"` | The launcher's bundle id; must stay in sync with `tauri.conf.json`. |
| `PathError` | `pub enum { NoDataDir, Io(std::io::Error) }` | `thiserror` error type. `NoDataDir` = OS data dir unresolvable; `Io` = `create_dir_all` failure (via `#[from]`). |
| `launcher_data_dir()` | `fn() -> Result<PathBuf, PathError>` | Root dir matching Tauri's `app_data_dir()`: `%APPDATA%\io.desklauncher\` (Win), `~/.local/share/io.desklauncher/` (Linux), `~/Library/Application Support/io.desklauncher/` (macOS). Calls `create_dir_all` so the dir exists on return. |
| `module_data_dir(module_id)` | `fn(&str) -> Result<PathBuf, PathError>` | `<launcher_data_dir>/modules/<module_id>/`, auto-created. The primary entry point every module uses. |
| `module_data_file(module_id, filename)` | `fn(&str, &str) -> Result<PathBuf, PathError>` | Convenience: `module_data_dir(id).join(filename)`; parent dir auto-created. |

Data dir convention: the OS app-data root is derived once from `dirs::data_dir()` + `LAUNCHER_IDENTIFIER`. Each module is namespaced under `modules\<id>\`, e.g. `%APPDATA%\io.desklauncher\modules\comtor\` (holds `vcomtor.db`, `audio\`, `settings.json`), `...\modules\open-sesame\` (`data.db`), etc. Launcher-level state (`launcher.toml`, migration markers) sits at the root next to `modules\`. Directories are created lazily on the first resolving call, so there is no separate setup step.

### `launcher-backup` (`crates/launcher-backup/`)
The backup toolkit consumed by the launcher host and the three stateful modules (MySSH, Open Sesame, Comtor). It provides all primitives needed to produce and consume a `.dlbak` bundle — a passphrase-encrypted tar archive containing per-module data subtrees plus a manifest.

| Module | Public item | Description |
|---|---|---|
| `types` | `ModuleExport`, `ModuleImport`, `ExportFile`, `SecretEntry`, `ExportOptions`, `ImportMode`, `BackupManifest` | Shared bundle types: `ExportOptions { include_heavy }` controls whether large artifacts (SSH keys, mirror folders, audio) are included; `ImportMode::Replace` replaces existing data; `BackupManifest` (stored as `manifest.json` inside the bundle) records module ids, format version, and timestamp. |
| `crypto` | `seal_with_passphrase(data, passphrase)`, `open_with_passphrase(data, passphrase)`, `seal_with_key(data, key)`, `open_with_key(data, key)`, `BundleKey::{Passphrase, Raw}` | Argon2id KDF (passphrase → 32-byte key) + XChaCha20-Poly1305 AEAD for symmetric encryption/decryption. `BundleKey::Passphrase` derives the key at runtime; `BundleKey::Raw` uses a pre-derived byte array (for machine-bound auto-backup). |
| `archive` | tar helpers | Builds/reads the unencrypted tar layer that holds per-module subtrees (`<id>/db.sqlite`, `<id>/secrets.json`, optional heavy files) and `launcher/appearance.json`. |
| `bundle` | `write_bundle(manifest, files, key)`, `read_bundle(bytes, key) -> ReadBundle` | Top-level API: `write_bundle` seals the tar into a `.dlbak` file; `read_bundle` opens and verifies it. The manifest is stored as `manifest.json` inside the encrypted tar. |
| `dbsnap` | `snapshot(src) -> Vec<u8>`, `restore(dst, bytes)` | Consistent SQLite snapshot via `VACUUM INTO` (zero-lock window); `restore` copies the snapshot into `dst` via the SQLite online backup API, which is safe even when another connection already has the file open. |

**Consumed by**: launcher host (`apps/launcher/src-tauri/src/backup/`), MySSH (`modules/myssh/rust/src/backup.rs`), Open Sesame (`modules/open-sesame/rust/src/backup.rs`), Comtor (`modules/comtor/rust/src/backup.rs`).

---

## BUILD & TOOLING

### Workspace wiring
- **Root `package.json`** — npm workspaces are **`apps/*` only** (the `packages/*` dirs are *not* npm workspaces; they're source folders resolved by Vite alias). Scripts: `sidecars` (runs the sidecar script), `dev` = `sidecars && tauri dev`, `build` = `sidecars && tauri build`, plus `frontend:dev`/`frontend:build`/`tauri` which delegate to the `@desk-launcher/launcher` workspace. So **every** `npm run dev`/`build` provisions sidecars first.
- **Root `Cargo.toml`** — Cargo workspace (`resolver = "2"`). Members: `apps/launcher/src-tauri`, `crates/launcher-paths`, and each module's `modules/<id>/rust`. Shared `workspace.package` (`edition = "2021"`, `rust-version = "1.77.2"`, authors) and `workspace.dependencies` (tauri 2.10, tauri-build 2.5.4, serde, serde_json, log, anyhow, thiserror) that modules inherit via `{ workspace = true }`.
- **Vite shared aliases** (`apps/launcher/vite.config.ts`) — `@desk-launcher/ui` → `packages/ui/src`, `@desk-launcher/tauri-bridge` → `packages/tauri-bridge/src`, `@desk-launcher/theme` → `packages/theme/src`, and `@modules` → `modules/`. (The launcher doc covers the full alias list, including per-module `@os`/`@cmt`/`@vid`/`@mdc`/`@pk` and the multi-page `rollupOptions.input`.) Because these packages ship no `package.json`, their runtime deps (`clsx`, `class-variance-authority`, `radix-ui`, `tailwind-merge`, `lucide-react`, `@fontsource/quicksand`, etc.) are declared in `apps/launcher/package.json`.

### Sidecar provisioning — `scripts/ensure-sidecars.mjs`
A standalone Node ESM script (no deps beyond `node:` built-ins). Hard-coded `targetTriple = x86_64-pc-windows-msvc` (Windows-first). It ensures two binaries exist under `apps/launcher/src-tauri/binaries/` with the triple suffix Tauri requires for sidecars:
- **yt-dlp** → `yt-dlp-x86_64-pc-windows-msvc.exe`, downloaded directly from the yt-dlp GitHub "latest" release (follows 30x redirects).
- **ffmpeg** → `ffmpeg-x86_64-pc-windows-msvc.exe`: downloads gyan.dev's `ffmpeg-release-essentials.zip` to a temp dir, expands it via PowerShell `Expand-Archive`, recursively locates `ffmpeg.exe`, copies it into `binaries/`, and cleans up the temp dir.

Each binary is skipped if it already exists and is non-empty (`hasFile`). Setting **`SKIP_SIDECARS=1`** short-circuits the whole script (`process.exit(0)`) — useful in CI or offline builds. Triggered automatically as the first step of `npm run dev` and `npm run build`.

---

## CONSUMED BY

| Shared piece | Consumers |
|---|---|
| `launcher-paths` crate | **All Rust crates that persist state**: launcher host (`apps/launcher/src-tauri`), Comtor (`audio.rs`, `db.rs`, `settings.rs`), Open Sesame (`utils/paths.rs`), Video Downloader (`paths.rs`), MySSH (`db/mod.rs`). MD Converter does **not** depend on it (no on-disk state). |
| `launcher-backup` crate | Launcher host (`backup/` orchestrator + commands), MySSH (`backup.rs`), Open Sesame (`backup.rs`), Comtor (`backup.rs`). Video Downloader and MD Converter have no backup integration (no persistent state to export). |
| `@desk-launcher/ui` | All module frontends + the launcher dashboard. Verified imports: launcher `Dashboard.tsx` / `ModuleCard.tsx`, MD Converter `MdConverter.tsx` / `SingleTab.tsx` / `BatchTab.tsx`. Other module frontends consume it via the same alias. |
| `@desk-launcher/tauri-bridge` | Module frontends that call a local HTTP backend (wired via the Vite alias). |
| `@desk-launcher/theme` | The launcher + **all five module frontends** — each wires `applyThemeFromStorage(appId)` + `<ThemeProvider appId>` at its window entry. Picker surface: launcher & **Comtor** mount `<ThemePicker>` in Settings; **MySSH / Open Sesame / Video Downloader / MD Converter** mount `<AppearanceButton>` in the header/sidebar. |
| Sidecars (`yt-dlp`, `ffmpeg`) | **Video Downloader** only — it is the only module that shells out to these CLI binaries. |
| `theme.css` | The launcher (`apps/launcher/src/main.css`) → applies to every module window. |

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound
- `npm run dev` / `npm run build` → invoke `scripts/ensure-sidecars.mjs` before launching/bundling Tauri.
- Any Rust module command that needs storage → calls `launcher_paths::module_data_dir(<id>)` (e.g. Comtor opening its SQLite DB, Video Downloader resolving its output/temp dir).
- The launcher's CSS pipeline → imports `packages/ui/src/theme.css`, which pulls Tailwind, animations, shadcn tokens, and the Quicksand font set.

### Outbound
- **Filesystem**: `launcher-paths` creates per-module data dirs (`create_dir_all`) under `%APPDATA%\io.desklauncher\modules\<id>\` on first call; the sidecar script creates `binaries/` and a temp ffmpeg work dir.
- **Network**: the sidecar script downloads binaries from `github.com/yt-dlp` and `gyan.dev` at dev/build time (the only place this shared layer reaches the network).
- **Subprocess**: the sidecar script spawns PowerShell `Expand-Archive` to unpack the ffmpeg zip.

---

## NOTES / GOTCHAS
- **"Modules never talk to each other"** (README) — this layer *is* the sanctioned sharing channel. Cross-module reuse goes through `packages/` (frontend) or `crates/` (Rust), never module-to-module imports.
- **Theme tokens are `--brand` / `--brand-2`** (not `--accent`, which was the design-spec name); the `--accent*` vars in `theme.css` are the shadcn bridge variables. App CSS consumes `var(--brand)` / `var(--text)` / `var(--panel)` / etc. — nothing hardcodes brand colors anymore.
- **No FOUC** — a window must call `applyThemeFromStorage(appId)` *before* `createRoot().render()`; the `ThemeProvider` owns it afterward.
- **Themes are per-app, not broadcast** — each app uses its own `appId`/storage, so changing the launcher theme does not change a module's. This is deliberate (keeps modules standalone-extractable).
- **Bundled binaries are gitignored** — `.gitignore` excludes `apps/launcher/src-tauri/binaries/`, so a fresh clone has no `yt-dlp`/`ffmpeg` until the sidecar script runs.
- **Target-triple naming is mandatory** — Tauri matches sidecars by the `-x86_64-pc-windows-msvc.exe` suffix; renaming breaks resolution. The triple is hard-coded (Windows-first project).
- **Frontend packages have no `package.json`** — `packages/ui` and `packages/tauri-bridge` are source-only, resolved by Vite alias; they are *not* npm workspaces (only `apps/*` is). Their peer deps live in `apps/launcher/package.json`.
- **First-call dir creation** — `launcher-paths` functions always `create_dir_all`, so they double as setup; never assume the dir is missing.
- **Always pass `module_data_dir` your real module id** — hard-coding a different bundle identifier or calling Tauri's `app_data_dir()` directly is exactly what this crate exists to prevent.
- **`CardAction` and the Select scroll buttons** are implemented but intentionally not re-exported from their barrels — import the listed exports only.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — consumes shared packages & registers modules
- [02-myssh](./02-myssh.md), [03-open-sesame](./03-open-sesame.md), [04-comtor](./04-comtor.md), [05-video-downloader](./05-video-downloader.md), [06-md-converter](./06-md-converter.md) — all consume this shared layer

---
_Last updated: 2026-06-19 · Synced: desk-launcher@43187ec · Format: v1_
