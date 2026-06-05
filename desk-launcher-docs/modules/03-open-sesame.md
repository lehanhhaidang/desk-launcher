# MODULE: OPEN SESAME

## OVERVIEW
Open Sesame is the largest Desk Launcher module: a project-documentation workspace that organizes folders of docs into **workspaces → doc-sets**, browses them with a git-aware file tree, renders Markdown/mermaid previews, and keeps each doc-set in sync with a GitHub repo. Authentication is GitHub **device-flow OAuth** (token stored in the OS keyring); sync is built on a local **git mirror** (a working copy under `~/.open-sesame/mirrors/<doc_set_id>/`) driven by `git2`, with per-source mapping, preflight conflict analysis, and a file watcher that emits live change events. Backend uses `rusqlite` (SQLite) + `git2` + `oauth2`/`reqwest` + `keyring`; frontend is React 19 + Zustand + react-router.

---

## KEY FEATURES
- **Workspaces & doc-sets**: hierarchical organization; a doc-set is a folder snapshot mirrored into a managed git working copy. Deleting a workspace cascades to its doc-sets (SQLite `ON DELETE CASCADE`).
- **GitHub device-flow OAuth**: `auth_github_start` → browser hand-off → frontend polls `auth_github_poll`; token saved to OS keyring (`keyring:` ref stored in DB, never the raw token).
- **Git-mirror sync engine**: `sync_up`/`sync_down`/`sync_force_push`/`sync_force_pull` over a per-doc-set mirror; commits exclude `.open-sesame/` metadata; pull uses fast-forward analysis and surfaces a structured `SyncIssue` (diverged/auth/repo_missing/network) for the UI.
- **Strategy detection**: `strategy_detector` classifies a folder as `standalone` (own git root or no git) vs `mirrored` (nested inside a git repo). In practice every doc-set is created as `Mirrored` with a managed mirror.
- **Source mapping + preflight**: a doc-set manifest (`.open-sesame/doc-set.json`) declares sources; a per-device file (`.open-sesame/device.local.json`) maps each source to a local path with a sync direction. `doc_set_mapping_preflight` diffs mirror vs local (same/only-mirror/only-local/conflicts) before committing a mapping.
- **File browser, search, preview, bookmarks**: recursive git-status-annotated tree, content/filename search, Markdown + mermaid + syntax-highlighted preview (with inline local images), standalone image viewing, and per-file bookmarks persisted in SQLite.
- **Smart file open**: clicking a file routes by type — Markdown/text/code render inline, images open in an inline viewer, and binary/Office/PDF/archive files launch in the OS default app via `plugin-opener`.
- **Live file watching**: `doc_set_watch_start/stop` registers a `notify` recursive watcher over mirror + mapped local paths; debounced changes are emitted to the frontend as `fs:change`.
- **Config export/import**: serialize selected workspaces' doc-sets and re-import them by re-cloning from GitHub.

---

## BACKEND FILES

### Commands
| File | Commands it defines |
|---|---|
| `rust/src/commands/auth.rs` | `auth_github_start`, `auth_github_poll`, `auth_list_accounts`, `auth_logout` |
| `rust/src/commands/workspace.rs` | `workspace_list`, `workspace_create`, `workspace_update`, `workspace_delete` |
| `rust/src/commands/doc_set.rs` | `doc_set_detect_strategy`, `doc_set_create`, `doc_set_list`, `doc_set_list_all`, `doc_set_delete`, `doc_set_move`, `doc_set_set_auto_sync`, `doc_set_setup_github_remote`, `doc_set_import_from_github`, `doc_set_sources`, `doc_set_mapping_preflight`, `doc_set_set_source_mapping`, `doc_set_add_source`, `doc_set_add_mirror_source`, `doc_set_remove_new_mirror_path`, `doc_set_refresh_mirror`, `doc_set_restore_local_from_mirror`, `doc_set_keep_both_local_changes`, `doc_set_watch_start`, `doc_set_watch_stop`, `config_export`, `config_import`. Also defines the `notify` watcher builder + `FileChangeEvent`/`fs:change` emission. |
| `rust/src/commands/sync.rs` | `sync_up`, `sync_down`, `sync_force_push`, `sync_force_pull`, `sync_status`, `sync_logs` |
| `rust/src/commands/files.rs` | `file_tree`, `file_content`, `file_search`, `file_toggle_bookmark`, `file_list_bookmarks`, `write_text_file`, `read_text_file` |
| `rust/src/commands/mod.rs` | Re-exports the command submodules. |

### Services
| File | Responsibility |
|---|---|
| `services/auth_service.rs` | GitHub device-flow HTTP: `request_device_code`, `poll_for_token` (returns `authorization_pending`/`slow_down`), `fetch_github_user`. |
| `services/workspace_service.rs` | Workspace CRUD + validation (non-empty, ≤100 chars, unique name). |
| `services/doc_set_service.rs` | Doc-set create (validate source dir, copy to mirror, write manifest), list, get, delete (removes mirror dir), move-to-workspace. |
| `services/doc_set_manifest_service.rs` (+ submodule dir) | The mapping/manifest engine — see submodules below. Public API: `write_manifest`, `mapping_overview`, `set_source_mapping`, `add_source`, `add_mirror_source`, `remove_new_mirror_path`, `mapping_preflight`, `preserve_local_changes_in_mirror`, `copy_enabled_local_to_mirror`, `copy_enabled_mirror_to_local`. |
| `services/doc_set_manifest_service/models.rs` | Mapping types: `DocSetManifest`, `ManifestSource`, `DeviceMappingFile`, `SourceMapping`, `SyncDirection`, overview/preflight DTOs. |
| `services/doc_set_manifest_service/overview.rs` | Writes `doc-set.json`/`device.local.json`; builds `MappingOverview` (status/severity/message per source); `set_source_mapping`. |
| `services/doc_set_manifest_service/storage.rs` | Read/write manifest + device-mapping files; path normalization, slugify, unique source-id / mirror-path helpers, per-source status computation. |
| `services/doc_set_manifest_service/transfer.rs` | `copy_enabled_local_to_mirror` / `copy_enabled_mirror_to_local` honoring per-source direction and excluding sibling sub-source dirs from the root source. |
| `services/doc_set_manifest_service/preflight.rs` | `mapping_preflight` (hash-diff mirror vs local) and `preserve_local_changes_in_mirror` (keep-both: copy new/conflicting local files into mirror, conflicts as unique copies). |
| `services/doc_set_manifest_service/sources.rs` | `add_source` (copy a local folder in as a new source), `add_mirror_source` (register an existing mirror subpath), `remove_new_mirror_path` (delete untracked-only mirror items). |
| `services/doc_set_manifest_service/git_guard.rs` | Guards mirror edits: `ensure_path_is_only_new_in_git` (only untracked new files removable), `remove_manifest_entries_under_path`. |
| `services/doc_set_manifest_service/file_compare.rs` | Hashing + path collection helpers for preflight (`collect_file_hashes`, `collect_file_paths`, `unique_local_copy_path`, sample push). |
| `services/doc_set_manifest_service/metadata.rs` | `ensure_internal_metadata_excluded` — adds `.open-sesame/` to `.git/info/exclude`, removes stale generated `.gitignore` lines. |
| `services/sync_service.rs` | The sync orchestrator: `sync_up`/`sync_down`/`force_push`/`force_pull`, DB status transitions, `SyncLog` writes, `sync:update` events, `classify_sync_error` → `SyncIssue`. Splits DB locks from `.await` provider calls (Connection is not `Send`). |
| `services/mirror_service.rs` | Filesystem mirror copy: `copy_to_staging[_with_excludes]`, `copy_from_staging`, change-only copy (mtime compare), orphan deletion, skips `.git`/`node_modules`/`.open-sesame`/etc. |
| `services/repo_service.rs` | GitHub REST: `create_github_repo`, `list_github_repos`. |
| `services/github_sync_setup_service.rs` | `setup_github_remote` — create-new or link-existing GitHub repo, validate URL, init local remote, persist `remote_url`/`branch`. |
| `services/github_import_service.rs` | `import_from_github` — clone a repo into a new mirror via force-pull, derive name from manifest/URL, insert doc-set. |
| `services/strategy_detector.rs` | `detect()` → `standalone` vs `mirrored` by walking up for `.git` (handles submodule `.git` file). |
| `services/file_tree_service.rs` | `read_tree_with_options` (depth-limited, git-status-annotated tree incl. synthesized "deleted" nodes), `read_file_content` (UTF-8, truncation). |
| `services/search_service.rs` | `search_content` (line matches in text files) and `search_filenames` (ranked), skipping vendor dirs. |
| `services/file_meta_service.rs` | Bookmarks/tags/notes upsert + list (`toggle_bookmark`, `set_tags`, `set_notes`, `list_bookmarks`). |
| `services/mod.rs` | Service module re-exports. |

### Repositories / DB
| File | Table(s) | Description |
|---|---|---|
| `db/migrations.rs` | all | 3 sequential migrations tracked in `_migrations`. Creates `settings`, `accounts`, `workspaces`, `doc_sets`, `sync_logs`, `file_meta`, `drive_file_state` + indexes; migrations 2–3 add/backfill `doc_sets.has_mapping`. |
| `db/account_repo.rs` | `accounts` | `insert`, `list_all`, `find_by_id`, `delete`. |
| `db/workspace_repo.rs` | `workspaces` | `insert`, `list_all`, `find_by_id`, `find_by_name`, `update`, `delete`. |
| `db/doc_set_repo.rs` | `doc_sets` | `insert`, `find_by_id`, `list_by_workspace`, `list_all`, `delete`, `update_status`, `update_sync_state`, `update_remote`, `update_auto_sync`, `update_has_mapping`. |
| `db/sync_log_repo.rs` | `sync_logs` | `insert`, `list_recent`. |
| `db/file_meta_repo.rs` | `file_meta` | `FileMeta` struct + `upsert` (ON CONFLICT doc_set_id+file_path), `find_by_path`, `list_bookmarked`. |
| `db/mod.rs` | — | DB module re-exports. (`drive_file_state` table exists in schema but has no dedicated repo — reserved for a future Google Drive provider.) |

### Models
| File | Represents |
|---|---|
| `models/account.rs` | `Account` + `ProviderType` (github/gitlab/google_drive). `token`/`refresh_token` are `#[serde(skip_serializing)]` so they never reach the frontend. |
| `models/doc_set.rs` | `DocSet`, `Strategy` (standalone/mirrored), `DocSetStatus` (idle/syncing/pending/conflict/error/disconnected), input DTOs (`CreateDocSetInput`, `SetupGithubRemoteInput` + `GithubRemoteMode`, `ImportGithubDocSetInput`). |
| `models/workspace.rs` | `Workspace` + create/update inputs; `Workspace::new` mints a UUID. |
| `models/sync_log.rs` | `SyncLog` + `SyncLogStatus` (success/conflict/error). |
| `models/mod.rs` | Model re-exports. |

### Providers / Utils / State
| File | Description |
|---|---|
| `providers/mod.rs` | `SyncProvider` trait (push/pull/force_push/force_pull/status/init_local/init_remote) + `SyncStatus`/`PullResult`. |
| `providers/git_provider.rs` | `GitProvider` — `git2`-backed impl: token-auth callbacks (`x-access-token`), commit excluding `.open-sesame`, push (auto force-refspec for empty repo, `NotFastForward` → Sync error), pull via merge-analysis (up-to-date/unborn/fast-forward only; diverge → conflict error), `force_pull` hard-resets to FETCH_HEAD. |
| `providers/factory.rs` | `create_provider` — loads account + resolves keyring token, builds `GitProvider`; Google Drive returns "not yet implemented". |
| `utils/paths.rs` | `app_data_dir` (`%APPDATA%\io.desklauncher\modules\open-sesame\`), `db_path` (`data.db`), `mirrors_dir`/`mirror_path` (`~/.open-sesame/mirrors/<id>/`). |
| `utils/secret_store.rs` | OS keyring access: `store_account_token` (returns `keyring:<provider>:<id>` ref), `resolve_token` (plaintext fallback for legacy), `delete_stored_token`. |
| `utils/mod.rs` | Utils re-exports. |
| `state.rs` | `AppState { db: Arc<Mutex<Connection>>, watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>> }`. |
| `error.rs` | `AppError` enum (Database/Git/Io/Network/Auth/Sync/Provider/NotFound/Validation/Internal) serialized to `{ kind, message }`. |
| `lib.rs` | Plugin `init()`: opens DB (WAL + FK pragmas), runs migrations, manages `AppState`, registers all commands under plugin `open-sesame`. |

### Build / Permissions / Capability
| File | Description |
|---|---|
| `rust/build.rs` | Canonical `COMMANDS` list (45 commands) → `tauri_plugin::Builder` autogenerates per-command permission files. |
| `rust/Cargo.toml` | Crate deps: `rusqlite`, `git2`, `oauth2`, `reqwest`, `keyring`, `notify`, `async-trait`, `launcher_paths`, etc. |
| `rust/permissions/default.toml` | `default` permission set granting all `allow-*` commands. |
| `rust/permissions/autogenerated/**` | One toml per command + `reference.md` + `schema.json`. |
| `apps/launcher/src-tauri/capabilities/open-sesame.json` | Window capability `open-sesame-window`: core/dialog/opener/log/fs/shell defaults, `fs:allow-read-file` (`$HOME/**`), `fs:allow-write-file`, `opener:allow-open-path` (`$HOME/.open-sesame/**` + `$HOME/**` — the latter lets the file tree hand binary files to the OS default app), `opener:allow-open-url` (github.com / api.github.com). |

---

## API ENDPOINTS (Tauri commands, invoked as `plugin:open-sesame|<command>`)

### Auth
| Command | Params | Description |
|---|---|---|
| `auth_github_start` | — | Request a GitHub device code; returns `{ device_code, user_code, verification_uri, expires_in, interval }`. |
| `auth_github_poll` | `device_code` | Poll for the token; on success fetches user, stores token in keyring, inserts `Account`, returns it. Errors `authorization_pending`/`slow_down` while waiting. |
| `auth_list_accounts` | — | List all logged-in `Account`s. |
| `auth_logout` | `account_id` | Delete keyring token + account row. |

### Workspace
| Command | Params | Description |
|---|---|---|
| `workspace_list` | — | All workspaces. |
| `workspace_create` | `input: CreateWorkspaceInput` | Create (validated, unique name). |
| `workspace_update` | `id`, `input: UpdateWorkspaceInput` | Rename/icon/sort_order. |
| `workspace_delete` | `id` | Delete (cascades to doc-sets). |

### Doc Set
| Command | Params | Description |
|---|---|---|
| `doc_set_detect_strategy` | `source_path` | Returns `{ strategy, parent_repo_path, reason }`. |
| `doc_set_create` | `input: CreateDocSetInput` | Validate source dir, copy → mirror, write manifest, insert. |
| `doc_set_list` | `workspace_id` | Doc-sets in a workspace. |
| `doc_set_list_all` | — | Every doc-set (used by overview/dashboards). |
| `doc_set_delete` | `id` | Delete row + mirror dir (best-effort). |
| `doc_set_move` | `id`, `workspace_id` | Reassign to another workspace. |
| `doc_set_set_auto_sync` | `id`, `enabled` | Toggle `auto_sync`, returns updated doc-set. |
| `doc_set_setup_github_remote` | `input: SetupGithubRemoteInput` | Create-new or link-existing GitHub repo; init local remote; persist remote_url/branch. |
| `doc_set_import_from_github` | `input: ImportGithubDocSetInput` | Clone a repo into a new mirror; create doc-set. |
| `doc_set_sources` | `doc_set_id` | `MappingOverview` (manifest + per-source mapping status); clears Error status. |
| `doc_set_mapping_preflight` | `input: MappingPreflightInput` | Diff a mirror path vs a candidate local path → `MappingPreflight` (counts + samples). |
| `doc_set_set_source_mapping` | `input: SetSourceMappingInput` | Persist a source→local mapping (path/enabled/direction); marks `has_mapping`. |
| `doc_set_add_source` | `input: AddSourceInput` | Copy a new local folder into the mirror as a new source. |
| `doc_set_add_mirror_source` | `input: AddMirrorSourceInput` | Register an existing mirror subpath as a source. |
| `doc_set_remove_new_mirror_path` | `input: RemoveMirrorPathInput` | Delete an untracked-only mirror path + its manifest entries. |
| `doc_set_refresh_mirror` | `doc_set_id` | Copy enabled local sources → mirror; returns file count. |
| `doc_set_restore_local_from_mirror` | `doc_set_id` | Copy enabled mirror sources → local; returns file count. |
| `doc_set_keep_both_local_changes` | `input: MappingPreflightInput` | Keep-both: copy new/conflicting local files into mirror (conflicts as unique copies). |
| `doc_set_push_from_local` | `doc_set_id` | **Directional reconcile** — force-copy enabled local sources → mirror (local wins; overwrites conflicts, keeps repo-only files, never deletes). Backs the mapping "Push from local" action. |
| `doc_set_pull_from_repo` | `doc_set_id` | **Directional reconcile** — force-copy enabled mirror sources → local (repo wins; overwrites conflicts, keeps local-only files, never deletes). Backs the mapping "Pull from repo" action. |
| `doc_set_watch_start` | `doc_set_id` | Start a `notify` watcher on mirror + mapped local paths (debounced `fs:change`). |
| `doc_set_watch_stop` | `doc_set_id` | Drop the watcher. |
| `config_export` | `workspace_ids` | Serialize selected workspaces' doc-sets → `ExportConfig`. |
| `config_import` | `config: ImportConfig`, `account_id` | Recreate workspaces and re-import doc-sets from GitHub; returns counts + errors. |

### Files
| Command | Params | Description |
|---|---|---|
| `file_tree` | `source_path`, `max_depth?` (5), `include_git_status?` (true) | Recursive git-annotated `FileNode` tree. |
| `file_content` | `file_path`, `max_bytes?` (1_000_000) | File text (+ size/truncated/extension). |
| `file_search` | `source_path`, `query`, `search_type?` ("content"\|"filename"), `max_results?` (50) | Content or filename search results (JSON). |
| `file_toggle_bookmark` | `doc_set_id`, `file_path` | Toggle bookmark; returns new state. |
| `file_list_bookmarks` | `doc_set_id` | Bookmarked `FileMeta` rows. |
| `write_text_file` | `path`, `content` | Write a file (used by in-app editing). |
| `read_text_file` | `path` | Read a file as string. |

### Sync
| Command | Params | Description |
|---|---|---|
| `sync_up` | `doc_set_id`, `message?` | Copy local→mirror (if clean), commit + push; returns `SyncResult` (with optional `SyncIssue`). |
| `sync_down` | `doc_set_id` | Fetch + fast-forward pull, then copy mirror→local. |
| `sync_force_push` | `doc_set_id`, `message?` | Force-push mirror over remote. |
| `sync_force_pull` | `doc_set_id` | Hard-reset mirror to remote, then copy mirror→local. |
| `sync_status` | `doc_set_id` | `setup_required`\|`not_initialized`\|`up_to_date`\|`local_changes` (ignores `.open-sesame`). |
| `sync_logs` | `doc_set_id`, `limit?` (20) | Recent `SyncLog`s. |

---

## FRONTEND FILES

### Stores
- `stores/auth-store.ts` — `accounts[]`, `isLoading` (Zustand). `isLoggedIn` derived from `accounts.length > 0`.
- `stores/workspace-store.ts` — `workspaces[]`, `activeWorkspaceId`, add/update/remove + active selection.
- `stores/doc-set-store.ts` — `docSets[]` for the active workspace.

### Features
- `features/auth/` — `login-screen.tsx` runs the full device-flow state machine (idle → awaiting → polling → error), opens `verification_uri` in the browser via `plugin-shell`, and self-paces polling on `authorization_pending`/`slow_down`. `hooks/use-auth.ts` exposes `fetchAccounts`/`logout` (App.tsx is the only caller of `fetchAccounts`).
- `features/workspace/` — `workspace-content.tsx` is the main shell (sidebar + active doc-set explorer + modals); `workspace-dashboard`, `workspace-overview`, `workspace-list`, `workspace-form`. `hooks/use-workspaces.ts` for CRUD + auto-select-first.
- `features/doc-set/` — `doc-set-card`, `doc-set-form` (create flow). `hooks/use-doc-sets.ts` for list/create/delete.
- `features/explorer/` — `explorer-layout.tsx` (resizable tree + preview; routes file clicks by kind via `lib/file-kinds.ts` → inline text preview / image viewer / OS default app; listens to `fs:change`/`sync:update` to refresh), `file-tree` (git-status icons), `markdown-preview` (react-markdown + rehype-highlight + remark-gfm; renders inline local images by reading bytes → blob URL, and renders block vs inline code correctly), `image-preview` (standalone image viewer, bytes → blob URL), `mermaid-diagram` (lazy-loaded mermaid, strict security), `search-bar`.
- `features/sync/` — `sync-controls` (up/down/force buttons), `sync-history`, `github-remote-setup-modal`, `source-mapping-modal` + `MappingTree`/`SelectedMappingPanel` (two directional actions: **Push from local** / **Pull from repo**) + `MappingPreflightDialog` (directional impact preview — overwrite/add/keep), plus `source-mapping-types.ts`/`source-mapping-utils.ts`. `session-sync-gate.tsx` (mounted in `App.tsx`, backed by `use-session-sync.ts`) shows pull-on-open / push-on-close confirm modals. `hooks/use-sync.ts` wraps the per-doc-set sync commands + `sync_status` and subscribes to `sync:update`.
- `features/help/` — `help-modal.tsx` renders bundled EN/VI guide Markdown (`?raw` imports) via the Markdown renderer.

### Lib / Layout
- `lib/tauri.ts` — `invoke<T>()` auto-namespaces to `plugin:open-sesame|<cmd>`; wraps errors in `InvokeError { kind, message }`.
- `lib/events.ts` — typed listeners `onSyncUpdate('sync:update')`, `onFileChange('fs:change')`, `onWatcherStatus('watcher:status')` (last has no backend emitter — see gotchas).
- `lib/utils.ts` — misc helpers (e.g. `cn`).
- `lib/file-kinds.ts` — file classification (`image`/`text`/`external`) + path helpers (`dirOf`, `resolveLocalPath`, `mimeFromExt`, `isRemoteOrData`) used by the explorer to route clicks and resolve Markdown image paths.
- `hooks/use-tauri-event.ts` — generic subscribe-with-cleanup hook.
- `components/layout/app-layout.tsx` — sidebar + `WorkspaceContent`; `sidebar.tsx` — workspace switcher.
- `components/ui/*` — shadcn-style primitives: `button`, `input`, `select`, `modal`, `dialog` (Radix), `spinner`/`LoadingState`/`LoadingSkeleton`; barrel-exported via `index.ts`.
- `App.tsx` / `main.tsx` — router gate (LoginScreen vs `SessionSyncGate` → AppLayout) and React root.
- `types/models.ts` — TS mirrors of all Rust models/DTOs; `types/errors.ts` — `AppError` shape.

---

## DATABASE

### Tables
| Table | Purpose |
|---|---|
| `settings` | Generic key/value app settings. |
| `accounts` | OAuth accounts (GitHub etc.); `token` column holds a `keyring:` reference, not the raw token. |
| `workspaces` | Top-level grouping of doc-sets. |
| `doc_sets` | A mirrored doc folder + its remote/sync/mapping state. |
| `sync_logs` | Append-only history of sync attempts per doc-set. |
| `file_meta` | Per-file bookmarks/tags/notes. |
| `drive_file_state` | Per-file local/remote hash tracking — reserved for a future Google Drive provider (no repo wired up yet). |
| `_migrations` | Migration tracking (id + applied timestamp). |

### Schema highlights
- `accounts.token` — keyring reference string `keyring:<provider>:<account_id>`; `is_default` INTEGER bool; `refresh_token`/`avatar_url` nullable.
- `doc_sets.workspace_id` → `workspaces(id) ON DELETE CASCADE`; `doc_sets.account_id` → `accounts(id)`.
- `doc_sets.strategy` — `standalone` | `mirrored` (always `mirrored` for new doc-sets).
- `doc_sets.status` — `idle` | `syncing` | `pending` | `conflict` | `error` | `disconnected` (default `idle`).
- `doc_sets.mirror_path` — absolute path to the git working copy under `~/.open-sesame/mirrors/<id>/`; `remote_url`/`remote_id` nullable until GitHub setup; `branch` default `main`; `auto_sync` bool; `last_synced_at`/`last_commit` track last successful sync; `has_mapping` (migrations 2–3) flags that a source has an enabled local mapping.
- `sync_logs.direction` — free-text `"up"`/`"down"`; `status` — `success` | `conflict` | `error`; `files_count`, `commit_hash`, `error_msg`.
- `file_meta` — `UNIQUE(doc_set_id, file_path)`; `bookmarked` INTEGER bool; `tags` stored as a comma-joined string. Partial index `idx_file_meta_bookmarked WHERE bookmarked = 1`.
- `drive_file_state` — `UNIQUE(doc_set_id, file_path)`; `local_hash`/`remote_hash`/`remote_id`/`remote_modified`/`local_modified`.
- Mapping state is **not** in SQLite — it lives in mirror files: `.open-sesame/doc-set.json` (`DocSetManifest`: version, doc_set_id, name, sources[]) and `.open-sesame/device.local.json` (`DeviceMappingFile`: device_id, mappings[] each with `source_id`, `local_path`, `enabled`, `direction` ∈ two_way/mirror_to_local/local_to_mirror/mirror_only).

---

## WORKFLOW

### GitHub OAuth (device flow)
1. Frontend `LoginScreen.startGitHubLogin()` → `auth_github_start` → backend `auth_service::request_device_code(client_id, scope=repo)` hits `github.com/login/device/code`, returns `{ device_code, user_code, verification_uri, expires_in, interval }`.
2. Frontend shows `user_code`, opens `verification_uri` in the system browser (`plugin-shell open`), and begins polling.
3. Polling loop (frontend-driven, self-paced) calls `auth_github_poll(device_code)` every `interval` seconds:
   - `poll_for_token` POSTs to `login/oauth/access_token`; while the user hasn't approved it returns `authorization_pending` (keep waiting) or `slow_down` (interval += 5).
   - Stops on `expires_in` deadline or `Cancel`.
4. On success: backend `fetch_github_user` gets `login`/`avatar_url`; mints account UUID; `secret_store::store_account_token` writes the raw token to the **OS keyring** and returns a `keyring:` reference; the reference (never the token) is persisted in `accounts`. The `Account` (token skipped from serialization) is returned and pushed into `auth-store`, flipping the app to the authenticated route.

### Doc-set sync / mirror
Think of each doc-set as: **local source folder(s) ↔ managed git mirror (`~/.open-sesame/mirrors/<id>/`) ↔ GitHub remote.**

- **Creation**: `doc_set_create` validates the source dir, `mirror_service::copy_to_staging` snapshots it into the mirror (skipping `.git`/`node_modules`/`.open-sesame`/etc.), writes the manifest + a default two-way mapping, and inserts the row (status `idle`, no remote yet). `strategy_detector` informs the UI but the stored strategy is always `Mirrored`.
- **Remote setup**: `doc_set_setup_github_remote` either creates a new GitHub repo (`repo_service::create_github_repo`, name slugified) or links an existing validated `.git` URL, then `GitProvider::init_local` wires the `origin` remote. Persists `remote_url`/`branch`.
- **Mapping & reconcile** (per device): the user maps each manifest source to a local path, then picks one of two directional actions. `doc_set_mapping_preflight` hashes mirror vs local (`same`/`only_mirror`/`only_local`/`conflicts`) and, when anything differs, the UI shows a directional impact preview (overwrite/add/keep) before applying. **Push from local** (`doc_set_push_from_local`) force-copies local→mirror (local wins); **Pull from repo** (`doc_set_pull_from_repo`) force-copies mirror→local (repo wins). Both overwrite conflicts in the chosen direction and **never delete** the other side's unique files. `doc_set_set_source_mapping` saves the mapping (`direction` always `two_way`) into `device.local.json` and sets `has_mapping`. _(The older 4-way `SyncDirection` and the keep-both/import/restore preflight actions remain in the backend for back-compat but are no longer surfaced.)_
- **Sync state machine** (`sync_service`): each op sets `doc_sets.status = syncing` (guards against concurrent sync), releases the DB lock, then runs the provider over the mirror, and finally records `last_commit`/`last_synced_at` (success) or `status = error`, plus a `sync_logs` row. Events `sync:update {started|completed|failed}` bracket the op.
  - **sync_up**: if mirror is clean, first copy enabled local→mirror (respecting direction, excluding sibling sub-source dirs); commit the mirror (excluding `.open-sesame`); push. A non-fast-forward push returns a `diverged` `SyncIssue`.
  - **sync_down**: fetch + merge-analysis. Only **up-to-date / unborn / fast-forward** are auto-applied; a true divergence returns a `Conflict` Sync error. Then copy enabled mirror→local.
  - **force_push / force_pull**: bypass divergence — force-push the mirror, or hard-reset the mirror to `FETCH_HEAD` and overwrite local.
- **Conflict handling**: rather than auto-merging, the backend surfaces a structured `SyncIssue { kind, message, details, recoverable, actions }` (kinds: `diverged`, `auth_error`, `repo_missing`, `network_error`, `setup_required`) with suggested `actions` (retry / force_push / force_pull / resolve_manually / setup_github). The UI presents these as recovery choices; doc-set status goes to `error` until a follow-up op succeeds.

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound (what invokes this module)
- **Frontend Tauri commands** (45) → handled in `commands/{auth,workspace,doc_set,files,sync}.rs::<command>()`, registered in `lib.rs::init()`.
- **Device-flow poll loop** (frontend timer) → repeatedly invokes `commands::auth::auth_github_poll()`.
- **File-watcher callbacks** (`notify` thread) → the closure built in `commands/doc_set.rs::build_doc_set_watcher()` fires on Create/Modify/Remove under the mirror or mapped local paths (debounced ~450 ms, skipping `.git`/`.open-sesame`).
- **Frontend event listeners** → `explorer-layout.tsx` and `use-sync.ts` re-fetch on `fs:change` / `sync:update`.

### Outbound (what this module sets off)
- **Events emitted to frontend** (only two real channels):
  - `fs:change` — from `commands/doc_set.rs::build_doc_set_watcher()` (`app_handle.emit`), payload `FileChangeEvent { doc_set_id, origin: local|mirror|unknown, changed_files[] }`.
  - `sync:update` — from `services/sync_service.rs::emit_sync_status()` (`app_handle.emit`), payload `{ doc_set_id, status: started|completed|failed, error }`.
  - (`watcher:status` is declared in `lib/events.ts` but is **never emitted** by the backend — dead listener.)
- **Git network calls** — `providers/git_provider.rs` (fetch/push/force_push/force_pull via `git2` with token credential callbacks) and `services/repo_service.rs` (GitHub REST: create/list repos). Auth HTTP in `services/auth_service.rs` (device code / token / user).
- **Keyring writes/reads/deletes** — `utils/secret_store.rs::{store_account_token, resolve_token, delete_stored_token}` (service `open-sesame`), called from `commands/auth.rs` and `providers/factory.rs`.
- **Filesystem writes** — mirror snapshots/orphan deletes (`mirror_service.rs`), manifest + device-mapping JSON (`doc_set_manifest_service/storage.rs`), `.git/info/exclude` edits (`metadata.rs` / `git_provider.rs`), `write_text_file`, and mirror-dir deletion on doc-set delete.
- **SQLite writes** — all repos under `db/` (WAL mode), guarded by `Arc<Mutex<Connection>>`.

---

## NOTES / GOTCHAS
- **Tokens never touch the frontend or git history**: `Account.token`/`refresh_token` are `skip_serializing`; the DB only stores a `keyring:` reference; `resolve_token` falls back to treating a non-prefixed value as legacy plaintext.
- **`.open-sesame/` is always excluded from commits**: enforced both via `.git/info/exclude` and by removing it from the index (`commit_index`), and a generated `.gitignore` line for `device.local.json` is actively cleaned up. `device.local.json` is per-device mapping state that must not be pushed.
- **Sync never auto-merges divergence**: `sync_down` only fast-forwards; conflicts require explicit `force_push`/`force_pull` or manual resolution. This is intentional and surfaced via `SyncIssue.actions`.
- **Mapping lives in files, not SQLite**: the manifest (`doc-set.json`) and per-device mapping (`device.local.json`) are the source of truth for sources/directions; `doc_sets.has_mapping` is just a denormalized flag.
- **Concurrency**: a single `Connection` behind a tokio `Mutex`; sync services deliberately drop the DB lock before `.await`ing provider calls because `rusqlite::Connection` is not `Send`. A doc-set in `status = syncing` rejects further sync ops.
- **Mirror copy is mtime-based**, not content-based — only files with a newer source mtime are copied, and orphaned files in the destination are deleted. Clock skew or touch-only changes can affect what copies.
- **`drive_file_state` table + Google Drive provider are stubs**: `ProviderType::GoogleDrive` returns "not yet implemented"; the table has no repo.
- **`config_import` re-clones from GitHub** — doc-sets without a `remote_url` are skipped (local-only doc-sets are not portable via export/import).
- **Strategy is effectively vestigial**: `strategy_detector` still classifies folders, but every created/imported doc-set is stored as `Mirrored` with a managed mirror ("Phase 6 makes mirror the only product path").
- **GitHub client ID is hard-coded** in `commands/auth.rs` (`GITHUB_CLIENT_ID`), with a comment that it should move to env/`tauri.conf.json`.
- **Inline/standalone images load via `@tauri-apps/plugin-fs::readFile` → blob URL**, resolved against the previewed file's directory. This uses the window's `fs:allow-read-file` scope, so images referenced **outside `$HOME` won't load**; Markdown image `src` that is `http(s):`/`data:`/`blob:` is passed through unchanged. (No Tauri asset protocol is used.)
- **File-click routing lives in `lib/file-kinds.ts`**: only known text/code/markdown extensions (and extensionless files) preview as text; known image extensions open the inline image viewer; everything else is handed to the OS default app via `opener`. This is why a Word/Excel/PPT/PDF click no longer hits `read_file_content`'s "not valid UTF-8 text" error path in normal use.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [07-shared-infra](./07-shared-infra.md) — launcher-paths data dir helper, shared UI

---
_Last updated: 2026-06-05 · Synced: desk-launcher@acbb5c5 · Format: v1_
