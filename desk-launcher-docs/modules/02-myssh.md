# MODULE: MYSSH

## OVERVIEW
MySSH is a Termius-style SSH client packaged as a Tauri plugin + React bundle. It manages saved hosts (with folders, tags, and search), opens **real interactive terminals** over SSH using the pure-Rust `russh` client rendered with `xterm.js`, supports **multiple concurrent session tabs**, stores reusable command **snippets**, runs **local port forwards**, and browses remote files over **SFTP**. Host metadata lives in SQLite; passwords/passphrases live in the OS keyring. It replaces the earlier Port Killer module.

---

## KEY FEATURES
- **Host management**: CRUD with single-level folders (groups), tags, and search; auth via password, SSH key, or the OS ssh-agent, with optional ProxyJump (bastion). Metadata in SQLite; secrets in the keyring.
- **Embedded interactive terminal**: `russh` (0.61, `ring` backend) opens a PTY + shell; output streams to the frontend as `myssh://data/<id>` events and is rendered by `xterm.js`. Keystrokes go back via `send_input`; the terminal refits + sends `window_change` on resize.
- **Multi-tab sessions**: each connection is a tab; all terminals stay mounted (visibility-toggled) so background sessions keep streaming.
- **Interactive host-key verification**: an unknown or changed key prompts the user (fingerprint shown, MITM warning on change) to accept or reject; accepted keys are stored in `known_hosts` and managed in a panel.
- **Command snippets**: saved command strings; one click sends a snippet (+ newline) to the active session via `send_input`.
- **Port forwarding**: local (`-L`), remote (`-R`), and dynamic/SOCKS (`-D`), each over a dedicated SSH connection. Definitions persist (with an optional auto-start flag); running state is in memory.
- **File manager (WinSCP-style)**: a dual pane — local + remote (SFTP over `russh-sftp`, its own SSH connection) — with a draggable splitter and drag-and-drop transfer, plus file preview tabs (text/code in a `<pre>`, Markdown rendered; remote binaries download, local binaries open in the OS app).

---

## BACKEND FILES

### Plugin / Rust (`modules/myssh/rust/`)
| File | Description |
|---|---|
| `src/lib.rs` | `init()` registers the `myssh` plugin, all commands, and `AppState`; on setup opens the SQLite DB (`db::open`) and runs migrations. |
| `src/state.rs` | `AppState { db, sessions, forwards, sftp }` — SQLite handle + maps of live session senders, running forward handles, and open SFTP sessions. |
| `src/error.rs` | `AppError` (thiserror) + `Serialize` emitting `{kind, message}`; `AppResult<T>`. |
| `src/services/ssh_client.rs` | All `russh` use. `connect_authenticated` (connect + password/key auth + TOFU handler), `open` (PTY+shell + per-session driver task), `SessionRequest`, `ConnectParams`. |
| `src/services/forward.rs` | `start_local`: bind a TCP listener and tunnel each connection via `direct-tcpip`. `ForwardHandle::stop` aborts the task. |
| `src/services/sftp.rs` | `open` (connect + `sftp` subsystem via `russh-sftp`) + `list`; `SftpHandle` holds the SSH connection alive. |
| `src/db/` | `migrations.rs` (hosts, groups, snippets, port_forwards, known_hosts), `host_repo`, `group_repo`, `snippet_repo`, `forward_repo`, `known_hosts_repo`. |
| `src/models/` | `host`, `group`, `snippet`, `forward`, `sftp` (serde camelCase). |
| `src/utils/secret_store.rs` | OS keyring (service `myssh`); DB stores only a `keyring:<host_id>` reference. |
| `src/commands/` | `hosts`, `groups`, `session`, `snippets`, `forward`, `sftp`. |
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
| SFTP | `sftp_open`, `sftp_list`, `sftp_download`, `sftp_upload`, `sftp_mkdir`, `sftp_remove`, `sftp_rename`, `sftp_read_text`, `sftp_close` |
| Local FS | `local_home`, `local_roots`, `local_list`, `local_read_text` |
| Host keys | `list_known_hosts`, `remove_known_host`, `respond_host_key` |

**Events (Rust → frontend)**: `myssh://data/<session_id>` (output bytes), `myssh://exit/<session_id>` (session ended).

---

## FRONTEND FILES (`modules/myssh/frontend/src/`)
- `MySSH.tsx` — host sidebar + a collapsible host header + the tabbed workspace; tab state; snippet routing to the active session.
- `components/Workspace.tsx` — one tab bar over multi-kind tabs (terminal / files / preview), all kept mounted (visibility-toggled).
- `components/FilesTab.tsx` — WinSCP-style dual pane: local pane + remote (SFTP) pane, draggable splitter, per-row + drag-and-drop transfer.
- `components/FilePane.tsx` — one reusable file list (path bar, navigate, row actions, drag source/drop target).
- `components/PreviewTab.tsx` — file preview: text/code in a `<pre>`, `.md` via `MarkdownView`; remote binary → Download, local binary → open in the OS app.
- `components/MarkdownView.tsx` — react-markdown + remark-gfm + rehype-highlight, styled like Open Sesame.
- `components/HostDialog.tsx` — host editor (auth/key-file/secret→keyring, ProxyJump).
- `components/{SnippetsPanel,ForwardsPanel,KnownHostsPanel}.tsx` — snippet / port-forward / known-host managers.
- `components/HostKeyModal.tsx` — interactive host-key accept/reject prompt.
- `terminal/TerminalView.tsx` — one `xterm` instance wired to a session's events + input/resize; copy/paste, search, reconnect, font zoom.
- `api/myssh-api.ts` — `invoke` wrappers + event listeners.
- `styles.css` — theme + highlight.js code styling.

---

## DATABASE
SQLite at `%APPDATA%\io.desklauncher\modules\myssh\myssh.db` (via `launcher-paths`). Tables: `hosts`, `groups`, `snippets`, `port_forwards`, `known_hosts`. Secrets are **never** stored in SQLite — passwords/passphrases live in the OS keyring keyed by host id; the `hosts.secret_ref` column holds only a `keyring:` reference. Live sessions, running forwards, and open SFTP browsers are in-memory maps in `AppState` (all torn down when the module window closes).

---

## WORKFLOW
**Connect:** double-click a host (or Connect) → a tab is created → `TerminalView` calls `open_session(hostId, cols, rows)`. The Rust command resolves the host + keyring secret, `connect_authenticated` dials via `russh` (TOFU host-key check), requests a PTY + shell, and spawns a task that emits output events and consumes input/resize/close from an mpsc channel. xterm renders output; keystrokes flow back through `send_input`.

**Snippet:** the active tab registers its session id; "Run" sends `command + \n` via `send_input`.

**Local forward:** `start_forward(id)` loads the definition + host, opens a dedicated authenticated SSH connection, binds the local port, and tunnels each accepted TCP connection to dest over a `direct-tcpip` channel. `stop_forward` aborts the task (closing the listener + connection).

**SFTP:** `sftp_open(host_id)` opens a dedicated SSH connection, requests the `sftp` subsystem, and returns a session id + home dir. The browser drives `sftp_list`/`sftp_download`/`sftp_upload`/`sftp_mkdir`/`sftp_remove`/`sftp_rename` against that id; transfers pass local file paths (picked via Tauri dialog) rather than bytes over IPC.

---

## NOTES / GOTCHAS
- **Crypto backend**: `russh` uses `default-features = false` + `ring`/`flate2`/`rsa` to avoid `aws-lc-sys`, which needs NASM to build on Windows/CI.
- **Host keys are interactive**: unknown/changed keys prompt the user (`myssh://hostkey-prompt` event → `respond_host_key`); a known, unchanged key is accepted silently. Clear an entry from the Known Hosts panel to re-trust a legitimately re-keyed server.
- **v2 / deferred**: SSH key generation, nested host folders, and cross-device sync.
- **Auth methods**: password, SSH key (optional passphrase), and OS ssh-agent (Windows OpenSSH named pipe / `SSH_AUTH_SOCK`). UI strings are English-only.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [07-shared-infra](./07-shared-infra.md) — shared UI primitives & launcher-paths

---
_Last updated: 2026-06-17 · Module: myssh · Format: v1_
