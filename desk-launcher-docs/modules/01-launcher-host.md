# MODULE: LAUNCHER HOST & SHELL

## OVERVIEW
The Launcher Host is the single Tauri 2 process that boots Desk Launcher: it registers every module's Rust plugin, renders the React dashboard in the main `launcher` window, and spawns each tool module into its own `WebviewWindow` on demand. All other modules (02–06) are children of this host — there is exactly one host process and one OS process, with per-window isolation enforced through Tauri capabilities and the Vite multi-page build.

---

## KEY FEATURES
- **Single host, many windows**: one Tauri process hosts the dashboard plus N module WebView windows, each loading its own HTML entry so module JS bundles stay isolated (`apps/launcher/src-tauri/src/window_manager.rs::open_module()`).
- **Plugin aggregation**: the host links all five module Rust plugins at compile time and registers them at startup via `.plugin(...)` (`apps/launcher/src-tauri/src/lib.rs:18-22`).
- **Open-or-focus semantics**: opening an already-open module focuses and unminimizes the existing window instead of spawning a duplicate (`window_manager.rs::open_module()`).
- **Dual registry**: a Rust window-spec registry (`module_registry.rs`) and a TS dashboard registry (`registry.ts`) must be kept in sync by hand.
- **Per-window scoped permissions**: each window label gets its own capability file; the launcher window itself only gets dashboard-level permissions (`apps/launcher/src-tauri/capabilities/*.json`).
- **Dashboard UX**: searchable module grid, live "open windows" status polling, plus Settings and "New module scaffold" modals (`apps/launcher/src/pages/Dashboard.tsx`).

---

## BACKEND FILES

### Host entry / Rust
| File | Description |
|---|---|
| `apps/launcher/src-tauri/src/main.rs` | Thin binary entry; sets `windows_subsystem = "windows"` in release and calls `desk_launcher_lib::run()`. |
| `apps/launcher/src-tauri/src/lib.rs` | `run()` builds the Tauri app: registers core plugins (log, shell, dialog, fs, opener) + all five module plugins, wires the `invoke_handler`, logs boot + app-data-dir in `.setup()`. |
| `apps/launcher/src-tauri/src/window_manager.rs` | Window lifecycle commands: `open_module`, `close_module`, `list_open_modules`; defines `WindowError` (UnknownModule / Tauri). |
| `apps/launcher/src-tauri/src/module_registry.rs` | Rust mirror of the TS registry: `ModuleWindowSpec` struct, `MODULES` array, `find(id)`, and the `list_modules` command. |

### Registries (must stay in sync)
| File | Role |
|---|---|
| `apps/launcher/src-tauri/src/module_registry.rs` | Authoritative **window spec** used to actually spawn a `WebviewWindow` (id, title, initial_url, width/height, min sizes). |
| `apps/launcher/src/modules/registry.ts` | Dashboard **metadata** the React grid renders (displayName, description, icon, category, accent classes, health, plus a `windowConfig` copy of the same sizes/url). |

Registered modules (Rust spec ↔ TS descriptor):

| id | Rust title | initial_url | Size (W×H, min) | TS displayName / health |
|---|---|---|---|---|
| `port-killer` | 🔌 Port Killer | `modules-pages/port-killer/index.html` | 1100×720, min 800×500 | Port Killer / ready |
| `open-sesame` | 📚 Open Sesame | `modules-pages/open-sesame/index.html` | 1280×800, min 960×600 | Open Sesame / ready |
| `comtor` | Virtual Comtor | `modules-pages/comtor/index.html` | 1280×800, min 960×600 | Virtual Comtor / ready |
| `video-downloader` | Media Toolbox | `modules-pages/video-downloader/index.html` | 1100×760, min 800×500 | Media Toolbox / beta |
| `md-converter` | 📝 Markdown Converter | `modules-pages/md-converter/index.html` | 1200×800, min 900×600 | Markdown Converter / beta |

### Capabilities
Each capability file binds permissions to a window **label** (the same string as the module `id`; the host window's label is `launcher`). Plugin permissions like `port-killer:default` resolve because each module crate registers its runtime plugin name via `Builder::new("<id>")` (verified in each `modules/<id>/rust/src/lib.rs`), and the crate is named `tauri-plugin-<id>` so Tauri strips the prefix.

| File | Window | Notable permissions |
|---|---|---|
| `capabilities/launcher.json` | `launcher` | `core:default`, `opener:default`, `log:default`, `dialog:default` — dashboard only; no fs/shell. |
| `capabilities/port-killer.json` | `port-killer` | `core`, `dialog`, `log`, `port-killer:default` (all port list/kill/tunnel logic lives in the plugin). |
| `capabilities/open-sesame.json` | `open-sesame` | `fs:default` + scoped `fs:allow-read-file`/`allow-write-file` on `$HOME/.open-sesame/**` (read also `$HOME/**`), `shell:allow-open`, `opener:allow-open-url` scoped to `github.com`/`api.github.com`, `open-sesame:default`. |
| `capabilities/comtor.json` | `comtor` | `dialog:default` + `dialog:allow-save` (xlsx export), `log`, `comtor:default`; Soniox/OpenAI network is gated by CSP, not capabilities. |
| `capabilities/video-downloader.json` | `video-downloader` | `dialog:allow-save`, `fs:allow-write-file` on `$HOME/**` + `$DOWNLOAD/**`, `shell:allow-execute` scoped to sidecars `binaries/yt-dlp` & `binaries/ffmpeg`, `video-downloader:default`. |
| `capabilities/md-converter.json` | `md-converter` | `core`, `dialog`, `fs:default`, `log`, `md-converter:default`. |

### Config / Build
| File | Description |
|---|---|
| `apps/launcher/src-tauri/tauri.conf.json` | Product identity `io.desklauncher`; declares the single static `launcher` window; `frontendDist: ../dist`, `devUrl: 127.0.0.1:5180`; `security.csp: null` (CSP delegated to per-module logic); NSIS bundle; `externalBin` sidecars `binaries/yt-dlp` + `binaries/ffmpeg`. |
| `apps/launcher/src-tauri/Cargo.toml` | Crate `desk-launcher` (lib `desk_launcher_lib`); depends on the five `tauri-plugin-*` module crates by path + shared `launcher-paths` crate. |
| `apps/launcher/src-tauri/build.rs` | Standard `tauri_build::build()`. |
| `apps/launcher/vite.config.ts` | Multi-page Rollup inputs, monorepo path aliases, dev server on port 5180, `server.fs.allow` raised to repo root. |
| `apps/launcher/tsconfig.json` | TS path aliases mirroring Vite; `include` pulls in `modules-pages` + every module's `frontend/src`. |
| `apps/launcher/package.json` | `@desk-launcher/launcher`; scripts `dev` (vite), `build` (`tsc -b && vite build`), `tauri`. |

---

## HOST COMMANDS (Tauri)
| Command | Params | Description |
|---|---|---|
| `open_module` | `{ id: String }` | If a window with label `id` exists, `set_focus()` + `unminimize()`; otherwise look up the spec via `module_registry::find(id)` and build a `WebviewWindow` (title, inner_size, resizable, centered, optional min size). Returns `Err(UnknownModule)` for an unknown id. (`window_manager.rs::open_module()`) |
| `close_module` | `{ id: String }` | Closes the window with label `id` if present; no-op otherwise. (`window_manager.rs::close_module()`) |
| `list_open_modules` | none | Returns all live webview window labels **except** `launcher`. (`window_manager.rs::list_open_modules()`) |
| `list_modules` | none | Returns the static list of registered module ids from the Rust registry. (`module_registry.rs::list_modules()`) |

Registered in `lib.rs::run()` via `tauri::generate_handler![...]`.

---

## FRONTEND FILES

### Pages / Entry
- `apps/launcher/index.html` — host window HTML; mounts `/src/main.tsx` into `#root`.
- `apps/launcher/src/main.tsx` — React 19 `createRoot` of `<App/>` under `StrictMode`; imports `main.css`.
- `apps/launcher/src/App.tsx` — renders `<Dashboard/>` (only page).
- `apps/launcher/src/pages/Dashboard.tsx` — the dashboard: sidebar, search box, module grid, footer; invokes `open_module` and `list_open_modules`; hosts the Settings and Scaffold modals (UI-only mockups, no backend wiring yet).
- `apps/launcher/src/main.css` — launcher theme (imports shared `packages/ui/src/theme.css`).

### Components
- `apps/launcher/src/components/ModuleCard.tsx` — one card per module; per-id accent/status maps; **Launch** button and card double-click both call `onOpen` → `open_module`; shows an "Active" indicator when the module's window is open.
- `apps/launcher/src/modules/registry.ts` — the TS module descriptor list (dashboard metadata + window config copy).

### Per-module HTML shims
Each is a minimal HTML page with a `#root` div and a `<script type="module" src="./main.tsx">`; the `main.tsx` shim owns the window's React root and mounts the real module component from `modules/<id>/frontend/src/` via an alias. (`apps/launcher/modules-pages/<id>/index.html` + `main.tsx`)

- `modules-pages/port-killer/index.html` + `main.tsx` — mounts `@modules/port-killer/frontend/src/PortKiller`.
- `modules-pages/open-sesame/main.tsx` — mounts `@os/App` + sonner `<Toaster/>` + `@os/index.css`.
- `modules-pages/comtor/main.tsx` — mounts `@cmt/App`; loads Quicksand fontsource subsets (Vietnamese/latin) + `@cmt/index.css`.
- `modules-pages/video-downloader/main.tsx` — mounts `@vid/VideoDownloader`; imports shared `packages/ui/src/theme.css` + module styles.
- `modules-pages/md-converter/main.tsx` — mounts `@modules/md-converter/frontend/src/MdConverter`.

---

## VITE / BUILD WIRING

Multi-page Rollup inputs (`vite.config.ts` `build.rollupOptions.input`) — one HTML per window:

| input key | HTML file |
|---|---|
| `launcher` | `index.html` |
| `port-killer` | `modules-pages/port-killer/index.html` |
| `open-sesame` | `modules-pages/open-sesame/index.html` |
| `comtor` | `modules-pages/comtor/index.html` |
| `video-downloader` | `modules-pages/video-downloader/index.html` |
| `md-converter` | `modules-pages/md-converter/index.html` |

Path aliases (Vite `resolve.alias`, mirrored in `tsconfig.json` `paths`):

| Alias | Resolves to |
|---|---|
| `@` | `apps/launcher/src` (launcher only) |
| `@modules` | `modules/` |
| `@desk-launcher/ui` | `packages/ui/src` |
| `@desk-launcher/tauri-bridge` | `packages/tauri-bridge/src` |
| `@os` | `modules/open-sesame/frontend/src` |
| `@cmt` | `modules/comtor/frontend/src` |
| `@vid` | `modules/video-downloader/frontend/src` |
| `@mdc` | `modules/md-converter/frontend/src` |
| `@pk` | `modules/port-killer/frontend/src` |

Dev server: port `5180`, `strictPort`, host `127.0.0.1`, `server.fs.allow` raised to the monorepo root (`../..`) so Vite can serve module + shared-package code that lives above `apps/launcher`. Build target `esnext`, `esbuild` minify. The per-module short aliases (`@os`/`@cmt`/etc.) exist so each module's pre-existing `@/` imports can be mechanically rewritten to a unique prefix without colliding with the launcher's own `@/`.

---

## WORKFLOW (opening a module window)
1. User clicks **Launch** (or double-clicks a card) in `Dashboard.tsx`; `handleOpen(id)` sets `opening` state and calls `invoke('open_module', { id })`.
2. The Tauri IPC routes to `window_manager::open_module(app, id)` in the host process.
3. If a window labeled `id` already exists → `set_focus()` + `unminimize()` and return (no duplicate spawned).
4. Otherwise `module_registry::find(&id)` looks up the `ModuleWindowSpec` (unknown id → `WindowError::UnknownModule`, surfaced to the dashboard as an error banner).
5. A `WebviewWindowBuilder` is created with label = `spec.id`, URL = `WebviewUrl::App(spec.initial_url)` (e.g. `modules-pages/comtor/index.html`), title, inner size, resizable, centered, and optional min inner size; `.build()` spawns the window.
6. Tauri matches the new window's **label** to the capability file whose `windows` list contains it, applying that window's scoped permissions (the new window cannot see the launcher's permissions or other modules').
7. The window loads its HTML entry → `main.tsx` shim mounts the real module React app from `modules/<id>/frontend/src/`.
8. Back on the dashboard, `handleOpen` then calls `refreshOpenModules()` → `invoke('list_open_modules')` to flip the card's status chip to "Active".

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound (what invokes this host)
- Dashboard **Launch**/double-click → `invoke('open_module', { id })` → `window_manager.rs::open_module()`.
- Dashboard mount + **Refresh** button + post-open → `invoke('list_open_modules')` → `window_manager.rs::list_open_modules()` (`Dashboard.tsx::refreshOpenModules()`).
- (Available, not currently called from the dashboard) `close_module`, `list_modules`.

### Outbound (what this host sets off)
- `open_module` spawns a child `WebviewWindow`, which loads a module HTML entry and boots that module's frontend — and, at the OS/IPC level, exposes that module's Rust plugin commands to the new window.
- At startup, `lib.rs::run()` registers every module plugin (`tauri_plugin_port_killer::init()`, `_open_sesame`, `_comtor`, `_video_downloader`, `_md_converter`) — so all module commands are live in the process even before any module window opens; capabilities are what gate which window may call them.
- `.setup()` logs the resolved `app_data_dir()` at boot.

---

## NOTES / GOTCHAS
- **Triple-sync point**: adding a module means editing four places — `module_registry.rs` (Rust spec), `registry.ts` (TS metadata), `vite.config.ts` (Rollup input), and a new `capabilities/<id>.json` — plus wiring the plugin in `lib.rs` and adding the `tauri-plugin-<id>` path dep in `Cargo.toml`. Drift between the Rust and TS registries is silent: the dashboard could list a module the Rust side can't spawn (→ `UnknownModule`), or vice-versa.
- **Window label = id**: `open_module` uses `spec.id` as the window label, and capabilities bind by that label. A label mismatch means a window silently runs with no module permissions.
- **`list_open_modules` filters `"launcher"`** explicitly, so the host window never appears as an "open module".
- **CSP is `null`** in `tauri.conf.json`; network-egress restrictions for modules like Comtor (Soniox/OpenAI) are described as CSP-enforced in capability comments but are not actually present in config — currently unrestricted at the host level.
- **Plugin name coupling**: capability strings like `comtor:default` only resolve because each crate calls `Builder::new("<id>")` and is named `tauri-plugin-<id>`; renaming either breaks permission resolution.
- The Settings and "New module scaffold" modals in `Dashboard.tsx` are **UI mockups** — no `invoke`/backend calls behind their Save/Generate buttons yet.
- `index.html` files are tagged `lang="vi"` and load `class="dark"` by default.

---

## RELATED MODULES
- [02-port-killer](./02-port-killer.md), [03-open-sesame](./03-open-sesame.md), [04-comtor](./04-comtor.md), [05-video-downloader](./05-video-downloader.md), [06-md-converter](./06-md-converter.md), [07-shared-infra](./07-shared-infra.md) — all module windows are spawned by this host

---
_Last updated: 2026-06-05 · Synced: desk-launcher@acbb5c5 · Format: v1_
