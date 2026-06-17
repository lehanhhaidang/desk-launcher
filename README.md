# Desk Launcher

[Vietnamese README](README-vi.md)

Desk Launcher is a Windows-first Tauri 2 desktop app that hosts multiple standalone tool modules from one dashboard. Each module runs in its own Tauri webview window with its own frontend bundle, Rust plugin, permissions, and local data.

The backend is written in Rust. The frontend uses React 19, TypeScript, Vite multi-page builds, Tailwind CSS v4, and shared UI/bridge packages inside the monorepo.

## Available Modules

| Module | What it does | Stack |
| --- | --- | --- |
| **MySSH** | Termius-style SSH client: managed hosts, multi-tab interactive terminals, command snippets, and local port forwarding. | `russh` + `xterm.js` + `rusqlite` + `keyring` |
| **Open Sesame** | Project documentation workspace with workspaces, doc sets, file tree browsing, Markdown preview, GitHub device-flow OAuth, and git sync. | `rusqlite` + `git2` + `oauth2` + `keyring` |
| **Virtual Comtor** | Real-time Japanese/Vietnamese meeting interpreter with Soniox + OpenAI, transcripts, summaries, audio storage, and `.xlsx` export. | `rusqlite` + `keyring` |
| **Video Downloader** | Downloads video/audio from YouTube, TikTok, Bilibili, and other supported sites through bundled `yt-dlp.exe` and `ffmpeg.exe`. | Tauri sidecars |
| **Markdown Converter** | Converts Office, PDF, HTML, EPUB and more to Markdown — Rust port of Microsoft MarkItDown. | `calamine` + `zip` + `htmd` + `pdf-extract` |

Each module stores its own SQLite database and settings under:

```text
%APPDATA%\io.desklauncher\modules\<id>\
```

## Repository Layout

```text
desk-launcher/
|-- apps/
|   `-- launcher/                    # Tauri host app
|       |-- src/                     # React dashboard
|       |-- modules-pages/<id>/      # HTML entry + main.tsx shim for each module
|       `-- src-tauri/
|           |-- src/                 # main.rs, lib.rs, window_manager.rs, module_registry.rs
|           |-- capabilities/        # One capability file per window/module
|           `-- binaries/            # yt-dlp.exe, ffmpeg.exe; gitignored
|
|-- modules/                         # Self-contained modules
|   |-- myssh/
|   |   |-- frontend/src/            # React UI, API wrappers, components
|   |   `-- rust/                    # Tauri plugin crate
|   |       |-- src/lib.rs           # pub fn init() -> TauriPlugin<Wry>
|   |       |-- permissions/default.toml
|   |       `-- build.rs             # Generates Tauri permission files
|   |-- open-sesame/
|   |-- comtor/
|   `-- video-downloader/
|
|-- packages/                        # Shared frontend packages
|   |-- ui/src/                      # UI primitives and theme.css
|   `-- tauri-bridge/src/            # Shared invoke wrappers
|
`-- crates/
    `-- launcher-paths/              # Per-module data directory helper
```

## Architecture

```
                 desk-launcher.exe (one Tauri process)
                              |
              Rust host: desk-launcher crate
              - registers ALL module plugins at startup
              - exposes open_module / close_module commands
                              |
        +---------+------------+-----------+
        v         v            v           v
   Launcher    MySSH        Open       Video
   window      window      Sesame    Downloader
   (dash)        |          window     window
       |         |            |           |
   launcher    myssh     open-sesame  video-downloader
   Vite       Vite          Vite         Vite
   entry      entry         entry        entry
```

**One process, many WebView windows.** Each window has its own JS bundle and scoped Tauri capabilities.

### Multi-window launcher

The dashboard renders module metadata from `apps/launcher/src/modules/registry.ts`. When a user opens a module, the frontend calls the Rust `open_module(id)` command. The launcher then creates a new `WebviewWindow` using the Rust-side mirror in `apps/launcher/src-tauri/src/module_registry.rs`.

Each module window loads a Vite multi-page entry such as:

```text
modules-pages/open-sesame/index.html
```

This keeps module bundles separate and lets each module window own its memory, route tree, UI state, permissions, and command surface.

### Tauri plugin pattern

Each Rust module is a Tauri plugin crate that follows the `tauri-plugin-<name>` convention:

- `Cargo.toml` declares the plugin crate, for example `name = "tauri-plugin-comtor"` and `links = "tauri-plugin-comtor"`.
- `build.rs` runs `tauri_plugin::Builder::new(COMMANDS).build()` to generate permission files.
- `permissions/default.toml` lists the module commands as `allow-<cmd>` permissions.
- `src/lib.rs` exposes `pub fn init() -> TauriPlugin<Wry>` and registers the invoke handler.

The frontend invokes module commands with:

```ts
invoke('plugin:<short-name>|<cmd>', args)
```

Each module window has a capability file in `apps/launcher/src-tauri/capabilities/` that includes the module's default permission set.

### Vite aliases

The launcher Vite config wires shared packages and module-local aliases:

| Alias | Points to |
| --- | --- |
| `@` | `apps/launcher/src` (launcher only) |
| `@modules` | `modules/` (used by HTML shims) |
| `@desk-launcher/ui` | `packages/ui/src` |
| `@desk-launcher/tauri-bridge` | `packages/tauri-bridge/src` |
| `@pk`, `@os`, `@cmt`, `@vid`, `@mdc` | Each module's own `frontend/src` |

The same paths are mirrored in `apps/launcher/tsconfig.json`.

### Tailwind CSS v4 scanning

The Vite root is `apps/launcher/`, while module source code lives outside that directory. Module CSS files therefore include explicit Tailwind sources so utilities are generated correctly:

```css
@source ".";
@source "../../../../packages/ui/src";
```

### Conventions

- **Module ID**: lowercase kebab-case (`myssh`). Used as the Rust plugin name, Tauri window label, data dir name, and Vite entry key. **Same string, everywhere.**
- **Rust commands**: `snake_case`, exposed via `#[tauri::command]`. Invoked from TS as `plugin:<id>|<snake_case>`.
- **Command params**: camelCase in JS, snake_case in Rust — serde converts automatically.
- **Errors**: simple modules return `Result<T, String>`. Modules with richer errors define a custom `AppError` enum with `thiserror` + a `Serialize` impl that emits the display string (see `modules/open-sesame/rust/src/error.rs`).
- **Managed state**: SQLite connections, task handles, etc. go into a `struct AppState` registered via `app.manage(...)`. Commands take `state: State<AppState>`.
- **Module root component**: default-exported from `<ModuleName>.tsx`, mounted by `apps/launcher/modules-pages/<id>/main.tsx`.
- **Two registries stay in sync manually**: `apps/launcher/src/modules/registry.ts` (TS, dashboard metadata) and `apps/launcher/src-tauri/src/module_registry.rs` (Rust, window specs).
- **Modules never talk to each other.** Shared code goes in `packages/` (frontend) or `crates/` (Rust).

## Requirements

- Windows 10/11
- Node.js 18+ and npm 9+
- Rust stable, installed through [rustup](https://rustup.rs)
- Microsoft Visual Studio Build Tools with the MSVC linker
- WebView2 Runtime, already included on most modern Windows installs

## Setup

```powershell
git clone https://github.com/lehanhhaidang/desk-laucher.git
cd desk-laucher
npm install
```

`npm run dev` and `npm run build` automatically download the Video Downloader sidecar binaries when they are missing.

## Development

Run the Tauri desktop app:

```powershell
npm run dev
```

Run only the Vite frontend:

```powershell
npm run frontend:dev
```

Build the installer:

```powershell
npm run build
```

The NSIS output is written under:

```text
apps/launcher/src-tauri/target/release/bundle/nsis/
```

## Video Downloader Binaries

Tauri `externalBin` expects sidecar binaries to include the target triple suffix. The root scripts run `npm run sidecars` automatically before desktop dev/build commands. You can also run it manually:

```powershell
npm run sidecars
```

The script downloads `yt-dlp.exe`, downloads the ffmpeg essentials archive, extracts `ffmpeg.exe`, and places both files under `apps\launcher\src-tauri\binaries`.

Expected file names:

```text
apps\launcher\src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe
apps\launcher\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe
```

To skip this step in CI or when managing sidecars yourself, set:

```powershell
$env:SKIP_SIDECARS = "1"
```

## Releasing

A GitHub Actions workflow (`.github/workflows/release.yml`) builds the Windows installer and publishes a GitHub Release when you push a version tag (`v*`):

1. Bump `version` in `apps/launcher/src-tauri/tauri.conf.json` and `package.json` (e.g. `0.1.0` → `0.2.0`) and merge to `main`.
2. Tag and push:

   ```powershell
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The `release` job builds on `windows-latest` (running `npm run sidecars` for the bundled `yt-dlp.exe`/`ffmpeg.exe`) and attaches the NSIS `.exe` to a **draft** Release.
4. Open the **Releases** tab and click **Publish**.

The tag must match the app version in `tauri.conf.json` (the workflow fails otherwise). No secrets are needed — it uses the automatic `GITHUB_TOKEN`. The installer is currently **unsigned**, so Windows SmartScreen may warn about an unknown publisher.

## Adding a Module

See **[ADDING-A-MODULE.md](ADDING-A-MODULE.md)** for the full 14-step walkthrough with example code.

High-level checklist:

1. Create the Rust plugin under `modules/<id>/rust/` (`Cargo.toml`, `build.rs`, `permissions/default.toml`, `src/lib.rs`).
2. Create the React UI under `modules/<id>/frontend/src/`.
3. Add the HTML shim under `apps/launcher/modules-pages/<id>/`.
4. Add a capability file under `apps/launcher/src-tauri/capabilities/<id>.json`.
5. Register the crate in root `Cargo.toml`, `apps/launcher/src-tauri/Cargo.toml`, `lib.rs`, and `module_registry.rs`.
6. Register the frontend metadata in `apps/launcher/src/modules/registry.ts`.
7. Add the Vite multi-page entry and (optional) alias in `apps/launcher/vite.config.ts` + `tsconfig.json`.

## Module Origins

- **Video Downloader** was migrated from an earlier tool project and rewritten around Rust/Tauri instead of Python sidecars.
- **MySSH** is a new module built on `russh` (embedded SSH) and `xterm.js`, replacing the earlier Port Killer module.
- **Open Sesame** came from a standalone Tauri documentation workspace app and was converted into a launcher module.
- **Virtual Comtor** came from `virtual_comtor_desktop` and was converted into a launcher module.

## Roadmap

- [ ] File Converter module for Markdown-to-PDF conversion with bundled Unicode fonts.
- [ ] MySSH: SFTP browser, remote/dynamic port forwarding, ssh-agent auth, and an interactive host-key accept prompt.
- [ ] Data export & sync — **per-module** (each module exports/syncs its own data) and **launcher-wide** (all modules at once). Everything is local-only today (per-module SQLite + OS keyring, no backend); plan is encrypted export/import first, then optional git-based sync (reusing Open Sesame's git2 + OAuth pattern). Secrets need an encrypted master-password vault, since OS-keyring entries can't leave the machine.
- [ ] Tighten CSP once the module permission and asset requirements are stable.
- [ ] Polish the NSIS installer and add auto-update.
- [ ] Add first-run migration for legacy Comtor data from `%APPDATA%\com.vcomtor.desktop\`.
- [ ] Refactor the Comtor view state machine toward React Router.
