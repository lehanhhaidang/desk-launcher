# DESK LAUNCHER - MODULE INDEX

## 1. PROJECT INTRODUCTION

**Desk Launcher** is a Windows-first **Tauri 2** desktop application that hosts multiple standalone tool modules from a single dashboard. It runs as **one OS process** that links every module's Rust plugin at compile time and spawns each tool into its own isolated `WebviewWindow` (its own JS bundle, route tree, UI state, scoped Tauri capabilities, and local data). Modules never talk to each other — shared code lives in `packages/` (frontend) or `crates/` (Rust).

### Main technologies
- **Backend**: Rust (edition 2021, rust-version 1.77.2), Tauri 2.10, one `tauri-plugin-<id>` crate per module. Key libs per module: `netstat2`+`sysinfo` (Port Killer), `rusqlite`+`git2`+`oauth2`+`keyring` (Open Sesame), `rusqlite`+`keyring` (Comtor), `image` crate + `yt-dlp`/`ffmpeg` sidecars (Video Downloader), `calamine`+`zip`+`quick-xml`+`htmd`+`pdf-extract` (Markdown Converter).
- **Frontend**: React 19, TypeScript, Vite multi-page build (one HTML entry per window), Tailwind CSS v4, shared `@desk-launcher/ui` (shadcn/Radix) + `@desk-launcher/tauri-bridge` packages. Zustand for state in larger modules.
- **Database**: Per-module SQLite via `rusqlite` (Open Sesame, Comtor); other modules are stateless or persist to files / browser `localStorage`. Each module's data lives under `%APPDATA%\io.desklauncher\modules\<id>\` (resolved by the `launcher-paths` crate). Secrets (API keys, OAuth tokens) live in the OS **keyring**, never in the DB.
- **Deployment**: NSIS installer built via `npm run build` (output under `apps/launcher/src-tauri/target/release/bundle/nsis/`). WebView2 runtime required.

### Repository shape
Single git repo (monorepo) rooted at `C:\desk-launcher`. npm workspaces cover `apps/*` only; `packages/*` are source-only, wired by Vite path aliases. Rust is a Cargo workspace whose members are the host crate + each module crate + the shared `launcher-paths` crate.

### Production URLs (if known)
- **Frontend**: N/A (desktop app)
- **Backend API**: N/A (no server; all logic is in-process Rust + user-driven external APIs)
- **Source**: `https://github.com/lehanhhaidang/desk-launcher` (per README setup; repo name is spelled "desk-launcher")

---

## 2. MODULE LIST

### 01. Launcher Host & Shell

**Description**: The single Tauri 2 host process. It links all five module Rust plugins at compile time, registers them at startup, renders the React dashboard in the main `launcher` window, and spawns each tool into its own isolated `WebviewWindow` on demand. Per-window isolation is enforced via Tauri capabilities (bound by window label) and a Vite multi-page build.

**Key Features**:
- Single host process hosting the dashboard + N module WebView windows, each with its own JS bundle and scoped capabilities
- Compile-time plugin aggregation + startup registration of all module plugins (`lib.rs`)
- Open-or-focus: re-opening a live module focuses/unminimizes it instead of duplicating the window
- Dual hand-synced registry: `module_registry.rs` (Rust window specs) ↔ `registry.ts` (TS dashboard metadata)

**Main Host Commands**:
| Command | Params | Description |
|---|---|---|
| `open_module` | `{ id }` | Focus existing window or build a new `WebviewWindow` from the spec (UnknownModule error if id absent) |
| `close_module` | `{ id }` | Close the window labeled `id` (no-op if absent) |
| `list_open_modules` | — | Live window labels, excluding `launcher` |
| `list_modules` | — | Static list of registered module ids |

**Frontend Pages**:
- `apps/launcher/src/pages/Dashboard.tsx` — module grid (`ModuleCard`), search, open-window status polling, Settings/scaffold modals
- `apps/launcher/modules-pages/<id>/index.html` + `main.tsx` — five per-module HTML shims that mount each module's real frontend

**Database**: none (host owns no storage; modules own their own)

**Related**: [02-port-killer](./02-port-killer.md), [03-open-sesame](./03-open-sesame.md), [04-comtor](./04-comtor.md), [05-video-downloader](./05-video-downloader.md), [06-md-converter](./06-md-converter.md), [07-shared-infra](./07-shared-infra.md)

---

### 02. Port Killer

**Description**: Lists listening/established TCP+UDP sockets (with owning PID/process name), labels and groups them, and bulk-kills stuck processes — with a frontend guard against terminating critical Windows system processes. Ships a complete SSH Tunnel Manager UI, but the Rust tunnel/ssh commands are currently stubs pending a planned implementation. The Rust backend is stateless; only the frontend persists (browser `localStorage`).

**Key Features**:
- Live port scan via `netstat2` + `sysinfo` (TCP LISTEN/ESTABLISHED + all UDP), deduped by (pid, port)
- Bulk/single process kill with per-PID success/error reporting
- Frontend-only system-process safety list (~30 Windows names + PIDs 0 & 4)
- Per-port labels/groups and named profiles persisted in `localStorage`
- SSH Tunnel Manager UI (create/start/stop/edit/delete) — **backend currently stubbed**

**Main API Endpoints** (`plugin:port-killer|<command>`):
| Command | Description |
|---|---|
| `list_ports` | Enumerate IPv4/IPv6 TCP+UDP sockets with PID/name |
| `kill_ports` | Kill a list of PIDs, return per-PID results |
| `create/update/delete/start/stop/list_tunnels`, `list_ssh_keys` | SSH tunnel CRUD+control — **all stubs today** |

**Frontend Pages**:
- `PortKiller.tsx` — single window, two tabs: **Ports** (metrics, actions, profile manager, paginated table) and **SSH Tunnels** (tunnel cards + add/edit dialog)

**Database**: in-memory only (no DB/managed state); frontend uses `localStorage` keys `port-killer-configs`, `port-killer-profiles`

**Related**: [01-launcher-host](./01-launcher-host.md), [07-shared-infra](./07-shared-infra.md)

---

### 03. Open Sesame

**Description**: The largest module — a project-documentation workspace that organizes doc folders into **workspaces → doc-sets**, browses them with a git-status-aware file tree, renders Markdown/mermaid previews, and keeps each doc-set synced with GitHub. Auth is GitHub device-flow OAuth (token in the OS keyring); sync runs through a local git mirror at `~/.open-sesame/mirrors/<id>/` driven by `git2`, with per-source mapping, hash-diff preflight, and a `notify` file watcher.

**Key Features**:
- GitHub device-flow OAuth with keyring-backed token storage (DB stores only a `keyring:` reference)
- Git-mirror sync engine (`sync_up`/`down`/`force_push`/`force_pull`) that **fast-forwards only** and surfaces structured `SyncIssue` recovery actions on divergence
- Per-source mapping + preflight: manifest (`doc-set.json`) + per-device mapping (`device.local.json`) with same/only-mirror/only-local/conflict diffing
- Git-aware file tree, content/filename search, Markdown+mermaid preview, SQLite-backed bookmarks
- Live file watching emitting debounced `fs:change` events; config export/import via GitHub re-clone

**Main API Endpoints** (`plugin:open-sesame|<command>`):
| Group | Representative commands |
|---|---|
| Auth | `auth_github_start`, `auth_github_poll`, `auth_list_accounts`, `auth_logout` |
| Workspace | `workspace_create/list/update/delete` (delete cascades to doc-sets) |
| Doc Set | `doc_set_create`, `doc_set_setup_github_remote`, `doc_set_mapping_preflight`, `doc_set_watch_start/stop` |
| Files | `file_tree`, `file_content`, `file_search`, `file_toggle_bookmark` |
| Sync | `sync_up`, `sync_down`, `sync_force_push`, `sync_force_pull`, `sync_status`, `sync_logs` |

**Frontend Pages**:
- Login (device-flow state machine), Workspace shell (sidebar + dashboard/overview), Doc-set cards + form, Explorer (file tree + Markdown/mermaid preview + search), Sync controls/history + mapping/preflight modals, Help modal (EN/VI)

**Database**: `settings`, `accounts`, `workspaces`, `doc_sets`, `sync_logs`, `file_meta`, `drive_file_state` (reserved), `_migrations`

**Related**: [01-launcher-host](./01-launcher-host.md), [07-shared-infra](./07-shared-infra.md)

---

### 04. Virtual Comtor

**Description**: Real-time Japanese ⇄ Vietnamese meeting interpreter. The browser streams mic audio to the Soniox real-time STT WebSocket (which also returns two-way JA/VI translations) and calls OpenAI for summaries; the Rust plugin owns **all persistence** — SQLite for projects/meetings/transcripts, OS keyring for API keys, filesystem for `.webm` audio, and a native dialog for `.xlsx`/`.csv` export. Local-first: nothing leaves the machine except the user-driven Soniox/OpenAI calls.

**Key Features**:
- Real-time STT + two-way JA↔VI translation over Soniox WSS (model `stt-rt-v4`) with speaker diarization & per-token language ID
- Projects → meetings → transcript-entries CRUD in SQLite; **standard** (saved) vs **private** (not persisted) meeting modes
- AI meeting summaries via OpenAI chat completions (`gpt-4o-mini`), stored as JSON in `meetings.summary`
- Mic recording to WebM/Opus saved to disk + in-app playback synced to transcript
- XLSX/CSV export built in JS, written via native save dialog; API keys in OS keyring; trilingual UI (vi/en/ja)

**Main API Endpoints** (`plugin:comtor|<command>`):
| Group | Representative commands |
|---|---|
| Projects & Meetings | `list/get/create/update/delete_project`, `list/list_recent/get/create/update/delete_meeting` |
| Transcripts & Audio | `save_transcript`, `save/get/delete_audio`, `audio_exists` |
| Settings & Keys | `get_settings`, `get/set/clear_soniox_key`, `get/set/clear_openai_key`, `get/set_prefs` |
| Export | `export_xlsx` (native save dialog; also used for CSV) |

**Frontend Pages**:
- `DashboardPage`, `ProjectsPage`, `ProjectDetailPage`, `MeetingPage` (→ live `MeetingRoom` or read-only `TranscriptViewer`), `SettingsPage`, `VersionPage`

**Database**: `projects`, `meetings`, `transcript_entries`, `app_meta` (`vcomtor.db`); audio = `.webm` files, prefs = `settings.json`, API keys = OS keyring

**Related**: [01-launcher-host](./01-launcher-host.md), [07-shared-infra](./07-shared-infra.md)

---

### 05. Video Downloader

**Description**: A "Media Toolbox" window with three local-media workflows: a URL downloader (**Capture**) driving the bundled `yt-dlp.exe` sidecar plus `ffmpeg.exe` for muxing/audio; a batch **image** processor running in-process via the Rust `image` crate; and a local **video** processor that shells out to the `ffmpeg.exe` sidecar. Each workflow owns an in-memory task table keyed by a UUID `task_id`, streams progress over a dedicated window event, and feeds a unified Zustand queue.

**Key Features**:
- URL capture via yt-dlp: `video_info` metadata → format/quality pick → MP4 (best+bestaudio merge) or MP3 with live progress, Save-As, cleanup
- Local video processing via ffmpeg: Convert / Compress (libx264 CRF) / Trim / Extract Audio, progress from `-progress pipe:1`
- Batch image processing via `image` crate (no sidecar): probe, optional crop, aspect-preserving resize, output PNG/JPEG/WebP
- Unified Queue (Zustand) across capture/image/video jobs with per-kind cancel + reveal-in-explorer
- Platform detection (YouTube/Bilibili/TikTok/X/Facebook/Instagram/Twitch) — actual support = whatever yt-dlp handles

**Main API Endpoints** (`plugin:video-downloader|<command>`):
| Group | Representative commands |
|---|---|
| Download | `video_info`, `video_download_start`, `video_download_read`, `video_download_cancel`, `video_download_cleanup` |
| Video processing | `media_video_probe`, `media_video_process_start/cancel/cleanup` |
| Image processing | `media_image_probe`, `media_image_read_bytes`, `media_image_process_start/cancel/cleanup` |

**Events (Rust → frontend)**: `video-progress`, `media-video-progress`, `media-image-progress`

**Frontend Pages**: Capture, Images, Videos, Queue (tabs in `MediaToolbox`)

**Database**: no SQLite — temp/output files under `…/modules/video-downloader/{downloads,images/<id>,videos/<id>}` + in-memory job tables (Rust `Mutex<HashMap>` + frontend Zustand)

**Related**: [01-launcher-host](./01-launcher-host.md), [07-shared-infra](./07-shared-infra.md)

---

### 06. Markdown Converter

**Description**: A pure-Rust Tauri plugin (partial port of Microsoft's MarkItDown) that converts Office, PDF, HTML, EPUB, Jupyter, and plain-data files to Markdown. Exposes four commands backed by per-format converters built on `calamine`, `zip`, `quick-xml`, `htmd`, and `pdf-extract`. Fully stateless — reads inputs and returns Markdown strings; batch mode writes `.md` files.

**Key Features**:
- 15+ formats → Markdown (DOCX, XLSX/XLS, PPTX, PDF, HTML, MD, TXT, CSV, JSON, XML, EPUB, IPYNB, ZIP)
- MarkItDown-faithful rendering (DOCX field stripping, PPTX slide/notes headers, IPYNB code fences)
- Single-file live preview + editable Markdown (react-markdown + GFM + highlight)
- Batch-to-disk with collision-safe `-1`/`-2` suffixing; drag-and-drop with directory recursion

**Main API Endpoints** (`plugin:md-converter|<command>`):
| Command | Description |
|---|---|
| `convert_file` | Detect format, read file, return Markdown (`ConvertResult`) |
| `convert_text` | In-memory convert (HTML/text/csv/json/xml only) |
| `convert_batch` | Convert many files and write `.md` per file |
| `supported_extensions` | List the 16 supported extensions |

**Frontend Pages**: live root `MdConverter.tsx` (split editor/preview). `SingleTab.tsx`/`BatchTab.tsx` exist but are **not mounted** by the current root.

**Database**: stateless — no persistent storage (only batch `.md` writes)

**Related**: [01-launcher-host](./01-launcher-host.md), [07-shared-infra](./07-shared-infra.md)

---

### 07. Shared Packages & Infrastructure

**Description**: The cross-cutting foundation (not a business domain) every module builds on: shared React UI primitives (`packages/ui`), a Tauri/HTTP bridge helper (`packages/tauri-bridge`), the `launcher-paths` Rust crate that gives each module its own isolated data dir, and the build/sidecar tooling. This is the concrete realization of the README rule "Modules never talk to each other; shared code lives in `packages/` or `crates/`."

**Key Features**:
- Shared shadcn/Radix UI primitives + `cn` util + central `theme.css`, consumed via the `@desk-launcher/ui` alias
- `@desk-launcher/tauri-bridge`: `apiRequest`, `apiDownload`, runtime-detected `API_BASE_URL`
- `launcher-paths`: per-module `%APPDATA%\io.desklauncher\modules\<id>\` isolation, auto-created
- `ensure-sidecars.mjs` downloads `yt-dlp.exe` + `ffmpeg.exe` (target-triple suffix), gated by `SKIP_SIDECARS`, run before every dev/build
- Frontend packages are source-only (no `package.json`); wired purely by Vite path aliases

**Shared Surface**:
- `@desk-launcher/ui` → `cn`, `Button`, `Input`, `Card*`, `Badge`, `LoadingSpinner`, `Select*`, `Tabs*`
- `@desk-launcher/tauri-bridge` → `apiRequest<T>`, `apiDownload`, `API_BASE_URL`
- `launcher-paths` → `launcher_data_dir()`, `module_data_dir(id)`, `module_data_file(id, name)`, `LAUNCHER_IDENTIFIER`, `PathError`

**Consumed by**: `launcher-paths` → host, Comtor, Open Sesame, Video Downloader (not Port Killer / MD Converter). UI → all frontends. Sidecars → Video Downloader only.

**Related**: all modules

---

## 3. SYSTEM ARCHITECTURE

### Databases / persistence
| Store | Owner | Tables / contents |
|---|---|---|
| SQLite `vcomtor.db` | Virtual Comtor | `projects`, `meetings`, `transcript_entries`, `app_meta` |
| SQLite (Open Sesame) | Open Sesame | `settings`, `accounts`, `workspaces`, `doc_sets`, `sync_logs`, `file_meta`, `drive_file_state`, `_migrations` |
| OS keyring | Comtor (`virtual_comtor`), Open Sesame | API keys (Soniox/OpenAI), GitHub OAuth tokens |
| Filesystem | Comtor (`.webm`), Video Downloader (downloads/output), Open Sesame (git mirrors) | Per-module data under `%APPDATA%\io.desklauncher\modules\<id>\` |
| Browser `localStorage` | Port Killer (frontend) | `port-killer-configs`, `port-killer-profiles` |

All on-disk module data is namespaced under `%APPDATA%\io.desklauncher\modules\<id>\` via the `launcher-paths` crate.

### Entry points (WebView windows)
| Window label | Entry HTML | Purpose |
|---|---|---|
| `launcher` | `index.html` | Dashboard (module grid) |
| `port-killer` | `modules-pages/port-killer/index.html` | Port Killer |
| `open-sesame` | `modules-pages/open-sesame/index.html` | Open Sesame |
| `comtor` | `modules-pages/comtor/index.html` | Virtual Comtor |
| `video-downloader` | `modules-pages/video-downloader/index.html` | Video Downloader |
| `md-converter` | `modules-pages/md-converter/index.html` | Markdown Converter |

Each window is created on demand by `open_module` and gets only its `<id>:default` capability set plus `core`/`dialog`/`log` defaults.

---

## 4. SYSTEM SCALE

_Qualitative size, not a live tally._

| Dimension | Scale |
|---|---|
| Backend surface (Tauri commands / services) | **large** — ~80+ commands across 6 plugins; Open Sesame alone has ~20 services |
| Data model (tables / models) | **medium** — ~12 SQLite tables across 2 modules; others stateless/file-based |
| Frontend (screens / components) | **large** — 6 independent React bundles, 100+ components |
| Module docs | 8 files (00-index + 7 modules) |

Buckets: small ≈ <10 · medium ≈ 10–40 · large ≈ 40+.

---
_Last updated: 2026-06-05 · Synced: desk-launcher@acbb5c5 · Format: v1_
