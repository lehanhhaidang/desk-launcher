# MySSH Module Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Verify each milestone builds before moving on. The russh internals (Task 4) are validated against the actual pinned crate version during implementation, not pre-written blind.

**Goal:** Replace the `port-killer` module with `myssh`, a Termius-style embedded SSH client (russh + xterm.js) with host management, multi-tab terminals, snippets, and port forwarding.

**Architecture:** New Tauri plugin crate `tauri-plugin-myssh` mirroring open-sesame's structure (`commands/ db/ models/ services/ error.rs state.rs utils/`). All SSH I/O is `russh` isolated in `services/ssh_client.rs`. Output streams to the frontend via Tauri events; `xterm.js` renders the terminal. Secrets in OS keyring, metadata in SQLite.

**Tech Stack:** Rust (russh, rusqlite, keyring, tokio, thiserror, uuid), React 19 + TypeScript, `@xterm/xterm`, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-06-16-myssh-module-design.md`

---

## Phase 1 — Remove Port Killer

### Task 1: Delete port-killer and all sync points

**Files:**
- Delete dir: `modules/port-killer/`
- Delete dir: `apps/launcher/modules-pages/port-killer/`
- Delete: `apps/launcher/src-tauri/capabilities/port-killer.json`
- Modify: root `Cargo.toml` (remove `"modules/port-killer/rust"` workspace member)
- Modify: `apps/launcher/src-tauri/Cargo.toml` (remove `tauri-plugin-port-killer` dep)
- Modify: `apps/launcher/src-tauri/src/lib.rs` (remove `.plugin(tauri_plugin_port_killer::init())`)
- Modify: `apps/launcher/src-tauri/src/module_registry.rs` (remove port-killer `ModuleWindowSpec`)
- Modify: `apps/launcher/src/modules/registry.ts` (remove port-killer descriptor; drop `'plug'` from `ModuleIcon` only if unused after Task 6)
- Modify: `apps/launcher/vite.config.ts` (remove `port-killer` rollup input + `@pk` alias)
- Modify: `apps/launcher/tsconfig.json` (remove `@pk/*` paths + include entry)

- [ ] Remove each entry above.
- [ ] Run `cargo check` (workspace) — expected: compiles with port-killer gone.
- [ ] Run `npm run build` frontend typecheck — expected: no dangling `@pk` references.
- [ ] Commit: `chore(myssh): remove port-killer module ahead of myssh`

---

## Phase 2 — Scaffold myssh (empty window that compiles & opens)

### Task 2: Rust plugin skeleton

**Files (create):**
- `modules/myssh/rust/Cargo.toml` — crate `tauri-plugin-myssh`, `links = "tauri-plugin-myssh"`, deps: tauri, serde, serde_json, log, thiserror, rusqlite (workspace, bundled), keyring, uuid, tokio, base64, russh, russh-keys, launcher-paths.
- `modules/myssh/rust/build.rs` — `COMMANDS` = full surface from spec §3.
- `modules/myssh/rust/permissions/default.toml` — `allow-*` for every command.
- `modules/myssh/rust/src/lib.rs` — `pub fn init() -> TauriPlugin<Wry>`, registers `AppState` + invoke handler. Stub commands return empty/`Ok` first.
- `modules/myssh/rust/src/error.rs` — `AppError` enum (thiserror) + `Serialize` to display string (copy open-sesame shape).
- `modules/myssh/rust/src/state.rs` — `AppState { db, sessions, forwards }`.

**Files (modify):** root `Cargo.toml` (+member), `apps/launcher/src-tauri/Cargo.toml` (+dep), `lib.rs` (+`.plugin(tauri_plugin_myssh::init())`), `module_registry.rs` (+spec id `myssh`, 1280×820, min 1000×640).

- [ ] Create crate; stub all commands (`list_hosts` → `Ok(vec![])`, etc.).
- [ ] `cargo check` — expected: clean (pulls russh).
- [ ] Commit: `feat(myssh): scaffold rust plugin crate`

### Task 3: Frontend shim + dashboard entry

**Files (create):**
- `apps/launcher/modules-pages/myssh/index.html` + `main.tsx` (mount `MySSH` from `@modules/myssh/...`).
- `modules/myssh/frontend/src/MySSH.tsx` — placeholder `<div>MySSH</div>`.
- `modules/myssh/frontend/src/styles.css` — Tailwind `@import` + `@source` lines.
- `modules/myssh/frontend/src/api/myssh-api.ts` — `invoke` wrappers, `ns = cmd => 'plugin:myssh|'+cmd`.
- `apps/launcher/src-tauri/capabilities/myssh.json` — `core:default`, `dialog:default`, `log:default`, `myssh:default`.

**Files (modify):**
- `apps/launcher/src/modules/registry.ts` — add `myssh` descriptor (add `'terminal'` to `ModuleIcon`, wire icon render).
- `apps/launcher/vite.config.ts` — add `myssh` rollup input + `@myssh` alias.
- `apps/launcher/tsconfig.json` — add `@myssh/*` paths + include.

- [ ] `npm run dev` — expected: MySSH card on dashboard, click opens empty window. **Milestone: scaffold works.**
- [ ] Commit: `feat(myssh): wire dashboard card + empty module window`

---

## Phase 3 — Host management (no SSH yet)

### Task 4: DB layer + host/group CRUD

**Files (create):**
- `modules/myssh/rust/src/db/mod.rs`, `migrations.rs` (tables: hosts, groups, snippets, port_forwards, known_hosts per spec §4), `host_repo.rs`, `group_repo.rs`.
- `modules/myssh/rust/src/models/*.rs` — `Host`, `Group` (+ serde).
- `modules/myssh/rust/src/utils/secret_store.rs` — copy open-sesame keyring helper, service `myssh`.
- `modules/myssh/rust/src/commands/hosts.rs`, `groups.rs`.

- [ ] Rust unit tests: host CRUD round-trip on in-memory sqlite; secret_store ref resolve.
- [ ] `cargo test -p tauri-plugin-myssh` — expected: PASS.
- [ ] Frontend: host sidebar (tree groups→hosts, search), host editor dialog (label/host/port/user/group/tags/auth/key-file picker/password→keyring).
- [ ] `npm run dev` — create/edit/delete host persists across restart.
- [ ] Commit: `feat(myssh): host & group management`

---

## Phase 4 — Embedded terminal (CORE milestone)

### Task 5: ssh_client.rs + session commands + xterm

**Files (create):**
- `modules/myssh/rust/src/services/ssh_client.rs` — russh client handler (TOFU `check_server_key`), connect, auth (password/key via russh-keys), request PTY+shell, reader loop emitting `myssh://data/<sessionId>`.
- `modules/myssh/rust/src/commands/session.rs` — `open_session`, `send_input`, `resize_session`, `close_session`.
- `modules/myssh/frontend/src/terminal/Terminal.tsx` — xterm instance, fit addon, `onData`→send_input, event→write, resize→resize_session.
- `modules/myssh/frontend/src/terminal/useSession.ts` — session lifecycle hook.

- [ ] Validate russh API against the pinned crate version (read crate docs/source) before writing the handler.
- [ ] Manual: connect to a real host (password), see prompt, run `ls`, type interactively. **Milestone: live terminal.**
- [ ] Commit: `feat(myssh): live ssh terminal via russh + xterm`

### Task 6: Multi-tab + TOFU host-key modal

**Files:** tab bar component, session store (open/focus/close tabs); `accept_host_key` command + `known_hosts` repo; host-key modal showing fingerprint.

- [ ] Manual: open 2+ sessions as tabs; first connect to a new host shows fingerprint modal; accept persists.
- [ ] Commit: `feat(myssh): multi-tab sessions + TOFU host-key verification`

---

## Phase 5 — Snippets & port forwarding

### Task 7: Snippets

**Files:** `commands/snippets.rs` + `snippet_repo.rs`; frontend snippets panel + CRUD dialog; "send to active session" = `send_input`.

- [ ] Manual: create snippet, click → text runs in active session.
- [ ] Commit: `feat(myssh): command snippets`

### Task 8: Port forwarding (local + remote)

**Files:** `services/forward.rs` (TCP listener → `direct-tcpip` channels), `commands/forward.rs` (`create/list/delete/start/stop_forward`), `forward_repo.rs`; frontend port-forward manager panel + add dialog.

- [ ] Manual: create a local forward, reach the forwarded port; start/stop toggles work.
- [ ] Commit: `feat(myssh): local + remote port forwarding`

---

## Phase 6 — Docs & acceptance

### Task 9: README + acceptance pass

**Files:** `README.md`, `README-vi.md` (module table swap Port Killer → MySSH; roadmap update).

- [ ] Run full manual acceptance list from spec §8.
- [ ] Commit: `docs: document myssh module, retire port-killer`

---

## Self-review notes

- Spec coverage: §1 identity→Task 3; §2 removal→Task 1; §3 backend→Tasks 2/5/8; §4 data→Task 4; §5 security→Tasks 5/6; §6 frontend→Tasks 3/5/6/7/8; §7 deps→Task 2; §8 testing→per-task manual + Task 4 unit; §9 risks→Task 5 isolation. Covered.
- russh internals deliberately milestone-level (external API, version-sensitive) — validated live in Task 5, isolated in one file per risk mitigation.
- UI strings English-only (user memory) — applies to all frontend tasks.
