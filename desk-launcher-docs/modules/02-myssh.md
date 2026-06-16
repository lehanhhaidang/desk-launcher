# MODULE: MYSSH

## OVERVIEW
MySSH is a Termius-style SSH client packaged as a Tauri plugin + React bundle. It manages saved hosts (with folders, tags, and search), opens **real interactive terminals** over SSH using the pure-Rust `russh` client rendered with `xterm.js`, supports **multiple concurrent session tabs**, stores reusable command **snippets**, and runs **local port forwards**. Host metadata lives in SQLite; passwords/passphrases live in the OS keyring. It replaces the earlier Port Killer module.

---

## KEY FEATURES
- **Host management**: CRUD for hosts with single-level folders (groups), free-text tags, and sidebar search. Metadata in SQLite; the host editor picks an SSH key file via the Tauri dialog.
- **Embedded interactive terminal**: `russh` (0.61, `ring` backend) opens a PTY + shell; output streams to the frontend as `myssh://data/<id>` events and is rendered by `xterm.js`. Keystrokes go back via `send_input`; the terminal refits + sends `window_change` on resize.
- **Multi-tab sessions**: each connection is a tab; all terminals stay mounted (visibility-toggled) so background sessions keep streaming.
- **TOFU host-key verification**: the client handler records a host's key fingerprint on first connect (`known_hosts` table) and **rejects** a changed key as a possible MITM.
- **Command snippets**: saved command strings; one click sends a snippet (+ newline) to the active session via `send_input`.
- **Local port forwarding**: bind a local port and tunnel each connection to a destination over a dedicated SSH session (`direct-tcpip` + `copy_bidirectional`). Definitions persist; running state is tracked in memory.

---

## BACKEND FILES

### Plugin / Rust (`modules/myssh/rust/`)
| File | Description |
|---|---|
| `src/lib.rs` | `init()` registers the `myssh` plugin, all commands, and `AppState`; on setup opens the SQLite DB (`db::open`) and runs migrations. |
| `src/state.rs` | `AppState { db, sessions, forwards }` — SQLite handle + maps of live session senders and running forward handles. |
| `src/error.rs` | `AppError` (thiserror) + `Serialize` emitting `{kind, message}`; `AppResult<T>`. |
| `src/services/ssh_client.rs` | All `russh` use. `connect_authenticated` (connect + password/key auth + TOFU handler), `open` (PTY+shell + per-session driver task), `SessionRequest`, `ConnectParams`. |
| `src/services/forward.rs` | `start_local`: bind a TCP listener and tunnel each connection via `direct-tcpip`. `ForwardHandle::stop` aborts the task. |
| `src/db/` | `migrations.rs` (hosts, groups, snippets, port_forwards, known_hosts), `host_repo`, `group_repo`, `snippet_repo`, `forward_repo`, `known_hosts_repo`. |
| `src/models/` | `host`, `group`, `snippet`, `forward` (serde camelCase). |
| `src/utils/secret_store.rs` | OS keyring (service `myssh`); DB stores only a `keyring:<host_id>` reference. |
| `src/commands/` | `hosts`, `groups`, `session`, `snippets`, `forward`. |
| `build.rs` / `permissions/` | `COMMANDS` array → auto-generated `allow-*` permission files; `default.toml` grants all. |

### Capability
| File | Notable permissions |
|---|---|
| `apps/launcher/src-tauri/capabilities/myssh.json` | Identifier `myssh-window`, window `myssh`. Grants `core:default`, `dialog:default` (key-file picker), `log:default`, `myssh:default`. |

---

## API ENDPOINTS (Tauri commands, `plugin:myssh|<command>`)
| Group | Commands |
|---|---|
| Hosts | `list_hosts`, `create_host`, `update_host`, `delete_host` |
| Groups | `list_groups`, `create_group`, `delete_group` |
| Sessions | `open_session` (→ session id), `send_input`, `resize_session`, `close_session` |
| Snippets | `list_snippets`, `create_snippet`, `update_snippet`, `delete_snippet` |
| Forwards | `list_forwards`, `create_forward`, `delete_forward`, `start_forward`, `stop_forward` |

**Events (Rust → frontend)**: `myssh://data/<session_id>` (output bytes), `myssh://exit/<session_id>` (session ended).

---

## FRONTEND FILES (`modules/myssh/frontend/src/`)
- `MySSH.tsx` — layout: host sidebar (groups → hosts, search, new host/group, snippets + forwards buttons) and the terminal workspace; tab state; snippet routing to the active session.
- `components/HostDialog.tsx` — host editor (label/host/port/user/group/tags/auth/key-file picker/secret→keyring).
- `components/SnippetsPanel.tsx` — snippet list (run/edit/delete) + add form.
- `components/ForwardsPanel.tsx` — forward list (running indicator, start/stop/delete) + add form.
- `terminal/TerminalView.tsx` — one `xterm` instance wired to a session's events + input/resize; reports its session id to the parent.
- `terminal/TerminalWorkspace.tsx` — tab bar + all mounted terminals (visibility-toggled).
- `api/myssh-api.ts` — `invoke` wrappers + event listeners.
- `styles.css` — theme (imports shared `theme.css`, Tailwind `@source`s).

---

## DATABASE
SQLite at `%APPDATA%\io.desklauncher\modules\myssh\myssh.db` (via `launcher-paths`). Tables: `hosts`, `groups`, `snippets`, `port_forwards`, `known_hosts`. Secrets are **never** stored in SQLite — passwords/passphrases live in the OS keyring keyed by host id; the `hosts.secret_ref` column holds only a `keyring:` reference. Live sessions and running forwards are in-memory maps in `AppState`.

---

## WORKFLOW
**Connect:** double-click a host (or Connect) → a tab is created → `TerminalView` calls `open_session(hostId, cols, rows)`. The Rust command resolves the host + keyring secret, `connect_authenticated` dials via `russh` (TOFU host-key check), requests a PTY + shell, and spawns a task that emits output events and consumes input/resize/close from an mpsc channel. xterm renders output; keystrokes flow back through `send_input`.

**Snippet:** the active tab registers its session id; "Run" sends `command + \n` via `send_input`.

**Local forward:** `start_forward(id)` loads the definition + host, opens a dedicated authenticated SSH connection, binds the local port, and tunnels each accepted TCP connection to dest over a `direct-tcpip` channel. `stop_forward` aborts the task (closing the listener + connection).

---

## NOTES / GOTCHAS
- **Crypto backend**: `russh` uses `default-features = false` + `ring`/`flate2`/`rsa` to avoid `aws-lc-sys`, which needs NASM to build on Windows/CI.
- **TOFU is automatic**: an unknown host key is accepted and stored on first use; a changed key is rejected. There is no interactive accept prompt yet (planned).
- **v2 / deferred**: SFTP browser, remote (`-R`) + dynamic/SOCKS forwarding, ssh-agent auth, key generation, and the interactive host-key accept modal.
- **Auth methods**: v1 supports password and key-file (with optional passphrase). UI strings are English-only.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [07-shared-infra](./07-shared-infra.md) — shared UI primitives & launcher-paths

---
_Last updated: 2026-06-16 · Module: myssh · Format: v1_
