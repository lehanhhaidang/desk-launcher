# Desk Launcher

Unified desktop tool launcher - một app Tauri 2 trên Windows, dashboard chứa nhiều "module" độc lập, mỗi module mở ra trong cửa sổ Tauri riêng.

100% **Rust** cho backend, **React 19 + TypeScript** cho frontend, **multi-window** qua Tauri WebView, **multi-page Vite** cho code-splitting theo module.

## Modules đang có

| Module | Mô tả | Stack |
|---|---|---|
| **MySSH** | SSH client kiểu Termius: quản lý host, terminal tương tác multi-tab, snippets lệnh, local port forwarding. | `russh` + `xterm.js` + `rusqlite` + `keyring` |
| **Open Sesame** | Quản lý tài liệu dự án - workspace, doc-set, file tree, Markdown preview, GitHub device-flow OAuth + git sync. | `rusqlite` + `git2` + `oauth2` + `keyring` |
| **Virtual Comtor** | Phiên dịch real-time Nhật <-> Việt cho meeting (Soniox + OpenAI), transcript + summary + xlsx export. | `rusqlite` + `keyring` (Windows Credential Manager) |
| **Video Downloader** | Tải video/audio (YouTube, TikTok, Bilibili, ...) qua bundled `yt-dlp.exe` + `ffmpeg.exe`. | Tauri sidecar |

Mỗi module có SQLite DB / settings riêng dưới `%APPDATA%\io.desklauncher\modules\<id>\`.

## Cấu trúc thư mục

```text
desk-launcher/
|-- apps/
|   `-- launcher/                    # Tauri host app
|       |-- src/                     # React dashboard
|       |-- modules-pages/<id>/      # HTML entry + main.tsx shim mỗi module
|       `-- src-tauri/
|           |-- src/                 # main.rs, lib.rs, window_manager.rs, module_registry.rs
|           |-- capabilities/        # 1 file per window (myssh.json, ...)
|           `-- binaries/            # yt-dlp.exe, ffmpeg.exe (gitignored)
|
|-- modules/                         # Mỗi module tự chứa frontend + Rust plugin
|   |-- myssh/
|   |   |-- frontend/src/            # React UI + api/ + components/
|   |   `-- rust/                    # Tauri plugin crate
|   |       |-- src/lib.rs           # pub fn init() -> TauriPlugin<Wry>
|   |       |-- permissions/default.toml
|   |       `-- build.rs             # tauri_plugin::Builder::new(COMMANDS).build()
|   |-- open-sesame/
|   |-- comtor/
|   `-- video-downloader/
|
|-- packages/                        # Shared frontend code (Vite aliases)
|   |-- ui/src/                      # shadcn primitives, theme.css
|   `-- tauri-bridge/src/            # invoke wrappers
|
`-- crates/
    `-- launcher-paths/              # Per-module data dir helper
```

## Kiến trúc & convention

### Multi-window

Click icon trên dashboard -> launcher gọi Rust command `open_module(id)` -> spawn `WebviewWindow` mới, load `modules-pages/<id>/index.html`. Mỗi window có bundle JS riêng (Vite multi-page), cô lập memory & code-splitting.

### Plugin pattern

Mỗi module Rust crate là một Tauri plugin theo convention `tauri-plugin-<name>`:

- `Cargo.toml`: `name = "tauri-plugin-comtor"`, `links = "tauri-plugin-comtor"`
- `build.rs`: chạy `tauri_plugin::Builder::new(COMMANDS).build()` để auto-gen permission files
- `permissions/default.toml`: liệt kê tất cả `allow-<cmd>` để capability có thể tham chiếu `<name>:default`
- `src/lib.rs`: expose `pub fn init() -> TauriPlugin<Wry>` với `Builder::new("<short-name>").invoke_handler(...).setup(...)`

Frontend gọi `invoke('plugin:<short-name>|<cmd>', args)`. Capability file mỗi window có `<short-name>:default` để allow tất cả commands.

### Vite aliases

- `@desk-launcher/ui`, `@desk-launcher/tauri-bridge` -> shared packages
- `@os/`, `@cmt/`, `@vid/` -> module internal imports (sed từ `@/` gốc của standalone)

### Tailwind v4

Vite root là `apps/launcher/`, nên module code outside root bị Tailwind auto-scanner bỏ qua. Mỗi CSS file thêm `@source` để Tailwind generate đầy đủ utility class:

```css
@source ".";
@source "../../../../packages/ui/src";
```

## Setup

### Yêu cầu

- **Node 18+** và **npm 9+**
- **Rust** stable (https://rustup.rs)
- **Microsoft Visual Studio Build Tools** (Windows - cần MSVC linker)
- **WebView2 Runtime** (đã có sẵn trên Win10/11 mới)

### Install & dev

```powershell
git clone https://github.com/lehanhhaidang/desk-laucher.git
cd desk-laucher
npm install

# npm run dev/build sẽ tự tải bundled binaries cho Video Downloader nếu thiếu

npm run dev
```

### Build

```powershell
npm run build      # -> apps/launcher/src-tauri/target/release/bundle/nsis/*.exe
```

### Binaries cho Video Downloader

Tauri externalBin yêu cầu file với suffix target triple. Root script sẽ tự chạy `npm run sidecars` trước `npm run dev` và `npm run build`. Nếu muốn chạy riêng:

```powershell
npm run sidecars
```

Script sẽ tải `yt-dlp.exe`, tải ffmpeg essentials archive, extract `ffmpeg.exe`, rồi đặt vào:

```text
apps\launcher\src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe
apps\launcher\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe
```

Nếu muốn bỏ qua bước này trong CI hoặc tự quản lý sidecar:

```powershell
$env:SKIP_SIDECARS = "1"
```

## Phát Hành (Release)

GitHub Actions (`.github/workflows/release.yml`) build installer Windows và tạo GitHub Release khi bạn push tag version (`v*`):

1. Bump `version` trong `apps/launcher/src-tauri/tauri.conf.json` và `package.json` (vd `0.1.0` → `0.2.0`) rồi merge vào `main`.
2. Tag và push:

   ```powershell
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. Job `release` build trên `windows-latest` (chạy `npm run sidecars` để có `yt-dlp.exe`/`ffmpeg.exe`) và đính file NSIS `.exe` vào một Release **nháp**.
4. Mở tab **Releases** → bấm **Publish**.

Tag phải khớp version trong `tauri.conf.json` (không khớp thì workflow tự fail). Không cần secret nào — dùng `GITHUB_TOKEN` tự động. Installer hiện **chưa ký số** nên Windows SmartScreen có thể cảnh báo "unknown publisher".

## Thêm module mới

1. **Tạo Rust plugin** `modules/<id>/rust/` (Cargo.toml, build.rs, permissions/default.toml, src/lib.rs với `Builder::new("<id>")`)
2. **Tạo React UI** `modules/<id>/frontend/src/`
3. **HTML shim** `apps/launcher/modules-pages/<id>/index.html` + `main.tsx` (mount module root component)
4. **Capability** `apps/launcher/src-tauri/capabilities/<id>.json` với `<id>:default` + permissions cần thiết
5. **Register Rust** trong [`apps/launcher/src-tauri/Cargo.toml`](apps/launcher/src-tauri/Cargo.toml) + `lib.rs` (`.plugin(tauri_plugin_<id>::init())`) + `module_registry.rs`
6. **Register Frontend** trong [`apps/launcher/src/modules/registry.ts`](apps/launcher/src/modules/registry.ts)
7. **Vite entry** trong [`apps/launcher/vite.config.ts`](apps/launcher/vite.config.ts) (`rollupOptions.input` + `resolve.alias`)
8. **tsconfig path** `@<short>/*` trong [`apps/launcher/tsconfig.json`](apps/launcher/tsconfig.json)

## Origin của các module

- **video-downloader**, **file-converter** (deferred) - gốc từ [`Tools`](https://github.com/lehanhhaidang) (Python sidecar đã được drop, rewrite pure Rust)
- **myssh** - module mới viết trên `russh` (SSH nhúng) + `xterm.js`, thay cho module Port Killer cũ
- **open-sesame** - gốc standalone Tauri app, plugin-hóa
- **comtor** - gốc từ [`virtual_comtor_desktop`](https://github.com/lehanhhaidang), plugin-hóa, refactor AppShell deferred

## Roadmap

- [ ] file-converter module (Markdown -> PDF với bundled Unicode font cho tiếng Việt)
- [ ] MySSH: SFTP browser, remote/dynamic port forwarding, ssh-agent auth, host-key accept prompt
- [ ] CSP tightening (union từng module -> strict CSP ở launcher)
- [ ] NSIS installer polish + auto-update
- [ ] First-run migration cho legacy comtor DB (`%APPDATA%\com.vcomtor.desktop\` -> `modules\comtor\`)
- [ ] Comtor `ViewKey` state machine -> React Router refactor
