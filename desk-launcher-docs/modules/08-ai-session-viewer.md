# MODULE: AI SESSION VIEWER

## OVERVIEW
The AI Session Viewer is a pure-Rust Tauri plugin + React frontend that browses and reads back the local chat logs written by AI coding assistants (Claude Code, Codex, …). It walks a provider's sessions root on disk, lists project folders and their `.jsonl` session files, and renders each session as a cleaned-up two-sided conversation — user prompts on the right, assistant replies (rendered as Markdown) on the left — with tool calls, tool results, thinking blocks and bookkeeping entries filtered out. The module is read-first and stateless (no DB): all filesystem access happens in Rust against the user's home directory, plus a couple of destructive file operations (delete / rename a session file) and Markdown/JSON export.

The navigation flow is: **Provider → Sessions folder → Project → Session → Chat view**.

---

## KEY FEATURES
- **Provider catalog**: static, extensible list (`Claude Code`, `Codex`) each with an OS-resolved default sessions path (`%USERPROFILE%`/`$HOME` + `.claude/projects` or `.codex/sessions`). The path is recomputed per machine at runtime, so it adapts to whatever user is logged in.
- **Browse or type the folder**: a native directory picker (`dialog` open, directory mode) sits beside an editable absolute-path input; picking a folder loads its projects immediately.
- **JSONL conversation filter**: `read_session` keeps only `user`/`assistant` turns, joins `type == "text"` blocks, and drops `tool_use`, `tool_result`, `thinking`, images, `isMeta` turns, and all bookkeeping entry types (`summary`, `queue-operation`, `file-history-snapshot`, `ai-title`, etc.).
- **Best-effort session titles**: a bounded probe of the first ~120 lines prefers `custom-title` → `ai-title` (key `aiTitle`, last seen wins as it refines) → `summary` → first user line.
- **Two-sided Markdown chat**: assistant messages render via `react-markdown` + `remark-gfm` + `rehype-highlight` (themed for chat bubbles); user messages stay verbatim plain text to preserve the exact prompt.
- **Manage session files**: delete a session (removes the `.jsonl` from disk, with a confirm dialog) and rename a session (renames the file on disk, inline edit, illegal characters sanitized). A renamed (non-UUID) filename becomes the row's primary label so the new name reads clearly.
- **Export**: save the open session as Markdown or JSON via a native save dialog (`writeTextFile`).
- **Resizable sidebar**: a drag handle between the Projects and Sessions sections adjusts their heights (clamped).
- **Refresh + live polling**: manual refresh buttons on each section and the chat header; the open session is re-read every 5s (updates only when content changes); project/session lists refresh every 5 minutes (gated on a first explicit load).
- **Appearance**: themeable via the shared `@desk-launcher/theme` engine — an `<AppearanceButton>` in the sidebar header; per-app `appId` `ai-session-viewer`. See [07-shared-infra](./07-shared-infra.md).

---

## BACKEND FILES

### Plugin / Commands
| File | Description |
|---|---|
| `modules/ai-session-viewer/rust/src/lib.rs` | Plugin entry (`init()` registers the `ai-session-viewer` plugin and the six commands). |
| `modules/ai-session-viewer/rust/src/commands/providers.rs` | `ProviderInfo` struct + `list_providers()`. Resolves per-provider default paths under the user home via `under_home()` (`%USERPROFILE%` then `$HOME`). |
| `modules/ai-session-viewer/rust/src/commands/sessions.rs` | The core: `ProjectEntry`/`SessionEntry`/`ChatMessage` structs, `list_projects`/`list_sessions`/`read_session`/`delete_session`/`rename_session`, the `extract_text` JSONL filter, `read_session_title` probe, `sanitize_stem` filename guard, and unit tests. |
| `modules/ai-session-viewer/rust/src/error.rs` | `ViewerError` (Io / NotFound / NotDir / Invalid) surfaced to the frontend as `String`. |

### Build / Permissions / Capability
| File | Description |
|---|---|
| `modules/ai-session-viewer/rust/Cargo.toml` | Crate `tauri-plugin-ai-session-viewer`. Deps: tauri/serde/serde_json/log/thiserror only (no file-format or DB crates — reads JSONL with `serde_json` line-by-line). |
| `modules/ai-session-viewer/rust/build.rs` | Declares `COMMANDS = [list_providers, list_projects, list_sessions, read_session, delete_session, rename_session]`; autogenerates permission files. |
| `modules/ai-session-viewer/rust/permissions/default.toml` | `default` set allowing all six commands. |
| `apps/launcher/src-tauri/capabilities/ai-session-viewer.json` | Capability for the `ai-session-viewer` window: `core:default`, `dialog:default`, `dialog:allow-save`, `fs:default`, scoped `fs:allow-write-text-file` (`$HOME/**`, for export), `log:default`, `ai-session-viewer:default`. No `fs` *read* permission — all reads are done in Rust. |

---

## API ENDPOINTS (Tauri commands, invoked as `plugin:ai-session-viewer|<command>`)
| Command | Params | Returns | Description |
|---|---|---|---|
| `list_providers` | (none) | `Vec<ProviderInfo { id, name, defaultBasePath?, sessionFormat }>` | Static provider catalog with OS-resolved default paths. |
| `list_projects` | `basePath: String` | `Vec<ProjectEntry { name, path, sessionCount, lastModified }>` | Lists sub-folders of `basePath` that contain ≥1 `.jsonl`, newest first. |
| `list_sessions` | `projectPath: String` | `Vec<SessionEntry { id, path, sizeBytes, lastModified, title? }>` | Lists `.jsonl` files in a project, newest first, each with a probed title. |
| `read_session` | `sessionPath: String` | `Vec<ChatMessage { role, content, timestamp? }>` | Parses one session into the cleaned-up conversation (tool calls/metadata stripped). Malformed lines skipped, not fatal. |
| `delete_session` | `sessionPath: String` | `()` | Permanently removes the `.jsonl` file from disk. |
| `rename_session` | `sessionPath, newName: String` | `String` (new absolute path) | Renames the file in place to `<sanitized>.jsonl`; errors if the target already exists. |

Structs serialize with `#[serde(rename_all = "camelCase")]` so the TypeScript types are camelCase; input arg names (`basePath`, etc.) are auto-converted by Tauri from the JS camelCase keys.

---

## FRONTEND FILES

### Root / Hook / API
- `modules/ai-session-viewer/frontend/src/AiSessionViewer.tsx` — Root: a sidebar + chat-view two-column layout; surfaces the error banner.
- `modules/ai-session-viewer/frontend/src/hooks/useSessionViewer.ts` — All state + actions: provider/path selection, load/refresh of projects & sessions, session selection, delete/rename, the 5s live-tail of the open session, and the 5-min list poll. `loadProjects(override?)` accepts a path override so Browse can load without a stale-state race.
- `modules/ai-session-viewer/frontend/src/api/ai-session-viewer-api.ts` — Thin `invoke` wrappers under the `plugin:ai-session-viewer|` namespace.
- `modules/ai-session-viewer/frontend/src/types.ts` — TS mirrors of the Rust structs (`ProviderInfo`, `ProjectEntry`, `SessionEntry`, `ChatMessage`).
- `modules/ai-session-viewer/frontend/src/format.ts` — `formatUnix` / `formatIso` / `formatBytes` helpers.

### Components
- `components/Sidebar.tsx` — Header (title + `AppearanceButton`), `ProviderPicker`, and the resizable Projects/Sessions split (pointer-drag handle, clamped). `SectionTitle` carries each section's refresh button.
- `components/ProviderPicker.tsx` — Provider chips + path input + **Browse** (directory dialog) + **Load projects**.
- `components/ProjectList.tsx` — Project rows (folder name + session count).
- `components/SessionList.tsx` — Session rows with hover **rename** (inline edit) / **delete** (confirm) actions; UUID-aware primary label.
- `components/ChatView.tsx` — Session header (title, **Refresh**, **Markdown**/**JSON** export) + the two-sided message bubbles.
- `components/MarkdownMessage.tsx` — Compact `react-markdown` (+ GFM + highlight) renderer for assistant bubbles, themed with this module's tokens.
- `modules/ai-session-viewer/frontend/src/styles.css` — Module theme + highlight.js code theme + message-wrapping / code-block CSS.

---

## DATABASE / STORAGE
Stateless — no SQLite, no keyring, no in-memory plugin state. The plugin reads session `.jsonl` files from the user's home (e.g. `%USERPROFILE%\.claude\projects\<project>\<uuid>.jsonl`) and returns parsed data. The only writes are **destructive file ops on the user's own logs** — `delete_session` (`fs::remove_file`) and `rename_session` (`fs::rename`) — plus frontend `writeTextFile` for the user-initiated Markdown/JSON export. No data is persisted under `%APPDATA%\io.desklauncher\` (the module does not use `launcher-paths`), so a typed/browsed path is **not** remembered between launches; the default is recomputed each time.

---

## WORKFLOW

### Read a session
1. On mount, `list_providers` populates the provider chips and seeds the path input with the selected provider's default.
2. User confirms the path (or **Browse**s to one) → `list_projects(basePath)` renders the Projects list.
3. User clicks a project → `list_sessions(projectPath)` renders the Sessions list (titles probed per file).
4. User clicks a session → `read_session(sessionPath)` returns the filtered conversation → `ChatView` renders user (plain) + assistant (Markdown) bubbles.
5. The open session is re-read every 5s; the user can also hit Refresh or export to `.md`/`.json`.

### Manage a session file
- **Rename**: pencil → inline input → `rename_session(path, newName)` → file renamed on disk → list refreshed, selection re-pointed to the new path.
- **Delete**: trash → confirm dialog → `delete_session(path)` → file removed → list refreshed; if it was the open session, the chat view clears.

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound (what invokes this module)
- `list_providers` (on mount), `list_projects` (Load/Browse + 5-min poll), `list_sessions` (project click, delete/rename refresh, 5-min poll), `read_session` (session click, manual refresh, 5s live-tail), `delete_session` / `rename_session` (row actions).

### Outbound (what this module sets off)
- File reads: `fs::read_dir` / `fs::read_to_string` / line scans in `sessions.rs` against the user's home directory.
- File writes: `fs::remove_file` (delete), `fs::rename` (rename), and frontend `writeTextFile` (export).
- No network, no spawned processes, no shared state, no events.

---

## NOTES / GOTCHAS
- **Paths are absolute**: the Rust side does `PathBuf::from(base_path)` with no resolution; a relative path is interpreted against the Tauri process CWD and will almost always fail. The default is always absolute.
- **Per-machine, not synced**: the default path adapts to the current machine/user, but session `.jsonl` files are local to each machine — switching machines shows that machine's own sessions unless the logs are copied over.
- **Rename breaks Claude resume**: Claude Code identifies a session by its UUID filename, so renaming the file means `claude --resume` no longer finds it. Fine for a viewer/archive; a future sidecar-name approach could avoid this.
- **Live-tail re-reads the whole file** every 5s; very large session files make this comparatively heavy. Updates are skipped when content is unchanged (length + last-message shape compared), but the read itself still runs.
- **No persistence of the chosen folder**: a typed/browsed path is not remembered across launches (no `launcher-paths` usage); the provider default is recomputed each time.
- **Codex is declared but Claude-shaped**: the `codex` provider exists with a default path, but `read_session` parses the Claude Code JSONL shape; other formats degrade gracefully (non-text/unknown lines are skipped) rather than being fully supported.
- **Tool-result-only / image-only turns vanish**: a user turn whose content is only a `tool_result` (or an assistant turn that is only `thinking`/`tool_use`) collapses to empty text and is dropped from the conversation by design.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [06-md-converter](./06-md-converter.md) — shares the `react-markdown` + GFM + highlight preview approach
- [07-shared-infra](./07-shared-infra.md) — shared UI primitives + theme engine

---
_Last updated: 2026-06-23 · Synced: desk-launcher@5d88d1a · Format: v1_
