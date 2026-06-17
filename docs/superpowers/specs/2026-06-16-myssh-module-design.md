# MySSH Module — Design Spec

**Date:** 2026-06-16
**Status:** Approved
**Goal:** Remove the `port-killer` module and replace it with `myssh` — a Termius-style SSH client embedded in Desk Launcher.

## Scope (v1)

In scope:

- **Host management** — CRUD, single-level folders (groups), free-text tags, search.
- **Authentication** — password and SSH key (file + optional passphrase). Agent auth deferred to v2.
- **Embedded interactive terminal** — real PTY-over-SSH via `russh`, rendered with `xterm.js`.
- **Multi-tab sessions** — multiple concurrent SSH sessions as tabs inside the single module window.
- **Snippets** — saved command strings, one click sends them to the active session.
- **Port forwarding** — real local + remote forwards via `russh` `direct-tcpip` channels. Dynamic/SOCKS deferred to v2.

Out of scope (v2+): SFTP file browser, dynamic/SOCKS forwarding, ssh-agent integration, cloud sync, key generation.

## 1. Module identity

| Attribute | Value |
|---|---|
| Module ID | `myssh` (same string everywhere) |
| Display name | MySSH (shortName "SSH") |
| Icon | add a `terminal` icon to the dashboard icon set (or reuse the freed `plug`) |
| Category | `dev`, accent sky/cyan (reused from port-killer) |
| Health | `beta` |
| Window | 1280×820, min 1000×640 |
| TS alias | `@myssh` |

## 2. Removing Port Killer

Delete: `modules/port-killer/`, `apps/launcher/modules-pages/port-killer/`, `apps/launcher/src-tauri/capabilities/port-killer.json`.

Remove the port-killer entry from each sync point:

- root `Cargo.toml` (workspace member)
- `apps/launcher/src-tauri/Cargo.toml` (path dep)
- `apps/launcher/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_port_killer::init())`)
- `apps/launcher/src-tauri/src/module_registry.rs` (window spec)
- `apps/launcher/src/modules/registry.ts` (dashboard descriptor)
- `apps/launcher/vite.config.ts` (rollup input + `@pk` alias)
- `apps/launcher/tsconfig.json` (`@pk` paths + include)

Update README.md / README-vi.md module table + roadmap. `Cargo.lock` regenerates automatically. `ADDING-A-MODULE.md` uses `screenshot-capturer` as its example, not port-killer, so it stays as-is.

## 3. Backend architecture (`tauri-plugin-myssh`, russh)

Directory structure mirrors open-sesame: `commands/`, `db/` (repos + `migrations.rs`), `models/`, `services/`, `error.rs` (custom `AppError` via `thiserror` + `Serialize`), `state.rs`, `utils/secret_store.rs`.

- **`AppState`**: `db: Arc<Mutex<Connection>>` + `sessions: Arc<Mutex<HashMap<SessionId, SessionHandle>>>` + `forwards: Arc<Mutex<HashMap<ForwardId, ForwardHandle>>>`. Same managed-state pattern as open-sesame's `watchers` map. Commands are `async` (russh is tokio-based; use Tauri's async runtime).
- **`services/ssh_client.rs`** isolates all `russh` usage so an API change touches one file.
- **Session lifecycle** (commands):
  - `open_session(hostId) -> SessionId`: resolve host + secret → connect → host-key check (TOFU) → authenticate (password/key) → request PTY + shell → spawn a reader task that emits `myssh://data/<sessionId>` events carrying output byte chunks → return `sessionId`.
  - `send_input(sessionId, bytes)` — write to the channel.
  - `resize(sessionId, cols, rows)` — window-change request.
  - `close_session(sessionId)` — close channel, abort reader task, drop handle.
- **Streaming**: Rust → frontend via Tauri events; keystrokes frontend → Rust via `invoke`. **No local PTY/ConPTY needed** — the server provides the PTY, `xterm.js` is the client-side terminal emulator. This is a major simplification vs. spawning `ssh.exe`.
- **Snippets**: pure `send_input` of stored text + newline; backend only does snippet CRUD.
- **Port forwarding**: `start_forward(spec)` opens a local TCP listener in Rust; each accepted connection opens a `direct-tcpip` russh channel and pumps bytes both ways. `stop_forward(id)` drops the listener + channels. v1 = local + remote forward. `list_forwards` returns runtime status. Forward definitions persist in DB; running state lives in `AppState.forwards`.

### Command surface (build.rs COMMANDS / permissions)

Hosts/groups: `list_hosts`, `create_host`, `update_host`, `delete_host`, `list_groups`, `create_group`, `delete_group`.
Sessions: `open_session`, `send_input`, `resize_session`, `close_session`.
Snippets: `list_snippets`, `create_snippet`, `update_snippet`, `delete_snippet`.
Forwards: `list_forwards`, `create_forward`, `delete_forward`, `start_forward`, `stop_forward`.
Host keys: `accept_host_key` (TOFU confirm), `list_known_hosts`.
Keys helper: `list_ssh_keys` (scan `~/.ssh` for candidate identity files).

## 4. Data & secrets

SQLite at `%APPDATA%\io.desklauncher\modules\myssh\`, versioned migrations like open-sesame.

- `hosts` (id TEXT PK, label, hostname, port, username, group_id NULL, auth_method `password|key`, key_path NULL, secret_ref NULL, tags, last_used, created_at, updated_at)
- `groups` (id, name) — flat folders, v1
- `snippets` (id, name, command)
- `port_forwards` (id, host_id, kind `local|remote`, bind_addr, bind_port, dest_host, dest_port, label)
- `known_hosts` (host, port, key_type, fingerprint)

**Secrets never in SQLite.** Passwords and key passphrases go to the OS keyring via `secret_store.rs` (service `myssh`), DB stores only a `keyring:<key>` reference — identical to open-sesame. Key files store only the path; read at connect time.

## 5. Security

- **TOFU host-key verification**: on connect, compare the server key fingerprint against `known_hosts`. Unknown → frontend modal showing fingerprint; on accept call `accept_host_key` to store it. Changed → hard MITM warning, require explicit re-accept before connecting.
- Secrets only in OS keyring.
- Capability `apps/launcher/src-tauri/capabilities/myssh.json`: `core:default`, `dialog:default` (key-file picker), `log:default`, `myssh:default`. No `shell:execute`.
- **All UI strings in English** (per user memory). Chat/task notes may be Vietnamese; product UI code must not be.

## 6. Frontend (React + xterm.js)

- **Layout**: left sidebar = host tree (groups → hosts) with search + tag filter + "New host"/"New group"; right = tabbed terminal area; a snippets drawer and a port-forward manager panel.
- **Terminal**: `@xterm/xterm` + `@xterm/addon-fit` (+ `addon-web-links`). One xterm instance per session; subscribe to `myssh://data/<sessionId>`, write bytes; `onData` → `send_input`; `onResize`/fit → `resize_session`.
- **Tabs**: each open session is a tab; clicking a host opens a new session tab (or focuses an existing one). Tab bar with close buttons + connection-status dot.
- **Host editor dialog**: label, host, port, user, group, tags, auth method, key-file picker (Tauri `dialog`), password/passphrase field (written to keyring, never echoed back).
- **Snippets panel**: list + CRUD dialog; click sends to the active session.
- **Port-forward manager**: list with start/stop toggles + add dialog (kind, bind, dest, host).
- **Host-key modal**: TOFU accept/reject with fingerprint display.
- Use `@desk-launcher/ui` primitives where possible; add module-local components only as needed. Module CSS includes the standard Tailwind `@source` lines.
- HTML shim + `main.tsx` under `apps/launcher/modules-pages/myssh/`; Vite rollup input + `@myssh` alias in `vite.config.ts` and `tsconfig.json`.

## 7. Dependencies

- **Rust**: `russh` (+ `russh-keys` for identity parsing), `tokio` (workspace), `keyring` (workspace), `rusqlite` (workspace), `uuid`, `thiserror`, `serde`/`serde_json`, `base64` (event payloads), `launcher-paths` (data dir).
- **Frontend**: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.

## 8. Testing

- **Rust unit tests**: DB repo CRUD, `secret_store` ref round-trip, `known_hosts` fingerprint compare, port-forward spec parsing, auth-method resolution, event-payload encoding. Network-dependent SSH handshake is verified manually (against localhost OpenSSH or a test host), not in CI, to avoid flakiness.
- **Frontend**: light component tests (host-list render, snippet send wiring). Terminal behavior verified manually.
- **Manual acceptance**: connect with password, connect with key, multi-tab, run a snippet, create a local forward and reach the forwarded port, TOFU prompt on first connect.

## 9. Risks & mitigations

- **russh API complexity / version churn** — biggest risk. Mitigate by isolating it in `services/ssh_client.rs` and pinning a known-good version.
- **Large-output streaming over Tauri events** — chunk output; coalesce small writes; rely on xterm's buffering.
- **xterm.js in a Vite multi-page build** — verify the entry bundles and the addon imports resolve.
- **Windows key-file paths / OpenSSH key formats** — accept both OpenSSH and PEM keys via `russh-keys`; surface clear errors.

## 10. Build order

1. Remove port-killer (all sync points) — app still builds with one fewer module.
2. Scaffold `myssh` plugin crate + registries + capability + Vite entry + HTML shim (empty UI compiles and opens).
3. DB layer (migrations, repos, models) + host/group CRUD + frontend host list.
4. `ssh_client.rs` + session commands + xterm terminal (single tab) — core milestone.
5. Multi-tab, TOFU host-key modal.
6. Snippets.
7. Port forwarding.
8. README updates + manual acceptance pass.
