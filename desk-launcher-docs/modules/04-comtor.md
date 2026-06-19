# MODULE: VIRTUAL COMTOR

## OVERVIEW
Virtual Comtor is a real-time Japanese ⇄ Vietnamese meeting interpreter packaged as a Tauri 2 plugin (`comtor`) plus a React 19/TypeScript frontend. The browser layer streams microphone audio to the Soniox real-time STT WebSocket (which also returns two-way JA/VI translations) and calls OpenAI for AI meeting summaries, while the Rust plugin owns all persistence: a per-module SQLite database (`rusqlite`) for projects/meetings/transcripts, the OS keyring (`keyring`) for API keys, the filesystem for recorded `.webm` audio, and a save dialog for `.xlsx`/`.csv` exports. It is "local-first": transcripts, audio and summaries never leave the machine except via the user-driven Soniox/OpenAI calls.

---

## KEY FEATURES
- **Real-time STT + two-way translation**: `useSonioxRealtime` opens a WebSocket to `wss://stt-rt.soniox.com/transcribe-websocket` (model `stt-rt-v4`), streams 16-bit PCM mic audio, and parses tokens into final/interim entries with speaker diarization, per-token language ID, and JA↔VI translation (`translation.type = two_way`).
- **Projects & meetings CRUD**: SQLite-backed projects → meetings → transcript-entries hierarchy with cascade delete; meetings have `standard` (saved) and `private` (not persisted) modes.
- **AI meeting summary**: `openai.service.ts` posts the transcript to `https://api.openai.com/v1/chat/completions` (default `gpt-4o-mini`, `response_format: json_object`) and returns `{ summary, keyPoints, actionItems }`, persisted as JSON in `meetings.summary`.
- **Audio recording & playback**: `useAudioRecorder` records the same mic stream via `MediaRecorder` (WebM/Opus); on stop the blob is saved to disk through `save_audio`, replayed by `AudioPlayer` via `get_audio`.
- **Transcript export**: client builds an `.xlsx` (via the `xlsx` lib) or `.csv` workbook in JS, then `export_xlsx` shows a native save dialog and writes the bytes to the chosen path.
- **Secure key storage**: Soniox + OpenAI keys live in the OS keyring (service `virtual_comtor`), never in SQLite; Settings page can set/test/clear each key. App gates first run on a Soniox key being present.
- **Trilingual UI (vi/en/ja)**: React context i18n with locale persisted to `localStorage` (`vcomtor_locale`) and mirrored into `settings.json` prefs.
- **Appearance**: themeable via the shared `@desk-launcher/theme` engine — `<ThemePicker>` in the Settings page; per-app `appId` `comtor` (wired in `modules-pages/comtor/main.tsx`). The module's own `components/ThemeProvider.tsx` is now a **passthrough shim** kept for back-compat. See [07-shared-infra](./07-shared-infra.md).

---

## BACKEND FILES

### Plugin / Commands
| File | Description |
|---|---|
| `modules/comtor/rust/src/lib.rs` | Plugin entry. `init()` builds the `comtor` plugin, registers all 26 commands via `generate_handler!`, and in `.setup()` calls `db::init()` and `app.manage(state)` so the SQLite connection is isolated to this plugin. No events emitted. |
| `modules/comtor/rust/src/projects.rs` | Project structs (`Project`, `NewProject`, `ProjectPatch`) + 5 commands (`list/get/create/update/delete_project`). `list/get` compute a correlated `meeting_count` subquery. |
| `modules/comtor/rust/src/meetings.rs` | Meeting + transcript structs + 7 commands (`list/list_recent/get/create/update/delete_meeting`, `save_transcript`). `get_meeting` returns `MeetingDetail` (flattened meeting + ordered entries). `save_transcript` runs a transaction: deletes existing entries, re-inserts with `ord`, updates `entry_count`. |
| `modules/comtor/rust/src/audio.rs` | Filesystem audio commands (`save/get/delete_audio`, `audio_exists`). Stores `<meeting_id>.webm` under the module `audio/` dir; no DB rows. |
| `modules/comtor/rust/src/settings.rs` | Keyring-backed API keys + JSON prefs. Commands `get_settings`, `get/set/clear_soniox_key`, `get/set/clear_openai_key`, `get/set_prefs`. Keyring service = `virtual_comtor`; prefs in `settings.json`. |
| `modules/comtor/rust/src/export.rs` | Single async command `export_xlsx`: opens a `tauri-plugin-dialog` save dialog (filter `*.xlsx`), writes the provided byte array to the chosen path; returns the path or `None` if cancelled. Used for both XLSX and CSV. |
| `modules/comtor/rust/src/error.rs` | `AppError` enum (`Db`/`Io`/`Json`/`Keyring`/`NotFound`/`Invalid`/`Internal`) with `Serialize` to a string; `AppResult<T>` alias. |

### DB / Storage
| File | Description |
|---|---|
| `modules/comtor/rust/src/db.rs` | `DbState(Mutex<Connection>)`; `init()` opens `vcomtor.db` under `launcher_paths::module_data_dir("comtor")`, runs `SCHEMA` (projects, meetings, transcript_entries, app_meta + indexes), seeds `schema_version=1`, and creates the sibling `audio/` dir. `now_ms()` epoch-ms helper. |

### Build / Permissions / Capability
| File | Description |
|---|---|
| `modules/comtor/rust/build.rs` | Canonical `COMMANDS` array (26 entries) fed to `tauri_plugin::Builder` to auto-generate per-command permission TOMLs. Must stay in sync with `lib.rs`. |
| `modules/comtor/rust/Cargo.toml` | Crate `tauri-plugin-comtor`. Deps: `rusqlite` (bundled), `keyring` (windows-native), `uuid`, `tauri-plugin-dialog`, `launcher-paths`. Description notes it was plugin-ized from the original `virtual_comtor_desktop` app. |
| `modules/comtor/rust/permissions/default.toml` | `comtor:default` permission set granting all 26 `allow-*` commands. |
| `modules/comtor/rust/permissions/autogenerated/commands/*.toml` | One generated `allow-/deny-` permission file per command. |
| `apps/launcher/src-tauri/capabilities/comtor.json` | Capability for the `comtor` window: `core:default`, `dialog:default` + `dialog:allow-save`, `log:default`, `comtor:default`. Notes Soniox/OpenAI HTTPS+WSS access is governed by CSP in `tauri.conf.json`, not capabilities. |

---

## API ENDPOINTS (Tauri commands, invoked as `plugin:comtor|<command>`)

### Projects & Meetings
| Command | Params | Description |
|---|---|---|
| `list_projects` | — | All projects ordered by `updated_at DESC`, each with `meetingCount`. |
| `get_project` | `id` | Single project (+ `meetingCount`); `NotFound` if missing. |
| `create_project` | `input: { name, description?, clientName? }` | Inserts project (UUID id), returns new `id`. Empty name → `Invalid`. |
| `update_project` | `id`, `patch: { name?, description?, clientName? }` | Partial update; bumps `updated_at`. |
| `delete_project` | `id` | Deletes project (cascades to meetings → entries). |
| `list_meetings` | `projectId` | Meetings of a project, `created_at DESC`. |
| `list_recent_meetings` | `limit?` (default 20) | Most recent meetings across all projects. |
| `get_meeting` | `id` | `MeetingDetail` = meeting fields + ordered `entries[]`. |
| `create_meeting` | `input: { projectId, title, mode? }` | Inserts meeting (`status=in_progress`, `mode` default `standard`), returns `id`. |
| `update_meeting` | `id`, `patch: {...}` | Partial update of title/status/mode/duration/started/ended/audioPath/summary/speakerMapping. |
| `delete_meeting` | `id` | Deletes meeting (cascades to entries). Audio file is not auto-deleted here. |

### Transcripts & Audio
| Command | Params | Description |
|---|---|---|
| `save_transcript` | `meetingId`, `entries: TranscriptEntry[]` | Transaction: replaces all entries for the meeting (re-numbers `ord`), updates `entry_count`, returns the count. |
| `save_audio` | `meetingId`, `bytes: number[]` | Writes `<meetingId>.webm` to the module `audio/` dir; returns the filename. |
| `get_audio` | `meetingId` | Reads the `.webm` bytes; `NotFound` if absent. |
| `delete_audio` | `meetingId` | Removes the `.webm` file if present. |
| `audio_exists` | `meetingId` | Boolean: does the `.webm` file exist. |

### Settings & API Keys
| Command | Params | Description |
|---|---|---|
| `get_settings` | — | `SettingsView { sonioxKeySet, openaiKeySet, prefs }` — key flags computed from keyring, prefs from `settings.json`. |
| `get_soniox_key` / `get_openai_key` | — | Returns the raw key from keyring or `null`. (`getSonioxKey` is read at meeting start to authenticate the WS.) |
| `set_soniox_key` / `set_openai_key` | `value` | Trims and stores in keyring; empty value deletes the entry. |
| `clear_soniox_key` / `clear_openai_key` | — | Deletes the keyring entry (no-op if absent). |
| `get_prefs` | — | `Prefs { locale, lastExportDir?, summaryModel }` from `settings.json` (defaults: locale `vi`, model `gpt-4o-mini`). |
| `set_prefs` | `patch: { locale?, lastExportDir?, summaryModel? }` | Merges + writes `settings.json`, returns updated prefs. |

### Export
| Command | Params | Description |
|---|---|---|
| `export_xlsx` | `bytes: number[]`, `suggestedName` | Native save dialog (`*.xlsx` filter), writes bytes to chosen path. Returns the saved path or `None` if cancelled. Frontend reuses it for CSV too. |

---

## FRONTEND FILES

### Pages
- `modules/comtor/frontend/src/pages/DashboardPage.tsx` — Landing view: project/recent-meeting counts, "with AI summary" stat, recent-meeting list, and a Soniox-key-missing banner that routes to Settings.
- `modules/comtor/frontend/src/pages/ProjectsPage.tsx` — Lists projects, inline create form (name/client/description), delete.
- `modules/comtor/frontend/src/pages/ProjectDetailPage.tsx` — Project header + its meetings; create-meeting form with `standard`/`private` mode toggle (start gated on Soniox key).
- `modules/comtor/frontend/src/pages/MeetingPage.tsx` — Loads a meeting; routes completed `standard` meetings to `TranscriptViewer`, otherwise renders the live `MeetingRoom`.
- `modules/comtor/frontend/src/pages/SettingsPage.tsx` — Soniox/OpenAI key set/clear, a "Test" button that opens a throwaway Soniox WS to validate the key, and UI-language selection.
- `modules/comtor/frontend/src/pages/VersionPage.tsx` — Version + changelog viewer.

### Translation feature (components / hooks / helpers)
- `features/translation/components/MeetingRoom.tsx` — Live orchestrator. Wires `useSonioxRealtime` → `useTranscript` + `useAudioRecorder`; start/pause/resume/stop; on stop (standard mode) saves transcript, then audio, then marks meeting `completed`. Hosts export, `AudioPlayer`, `MeetingSummary`.
- `features/translation/components/TranscriptViewer.tsx` — Read-only view of a completed meeting: loads entries, search/filter, XLSX export, audio download, delete, plus `AudioPlayer`/`MeetingSummary`.
- `features/translation/components/TranscriptPanel.tsx` / `TranscriptEntryItem.tsx` — Render the running list of entries + the interim line.
- `features/translation/components/MeetingControls.tsx` — Start/Pause/Resume/Stop buttons driven by connection state.
- `features/translation/components/MeetingSummary.tsx` — Loads/persists summary JSON; "Generate"/"Regenerate" calls `generateMeetingSummary` (disabled without an OpenAI key).
- `features/translation/components/AudioPlayer.tsx` — Fetches `get_audio`, builds a blob URL, play/seek, emits `currentMs` for transcript highlighting.
- `features/translation/components/LanguageBadge.tsx` / `SpeakerBadge.tsx` — Per-entry JA/VI flag + speaker chips.
- `features/translation/hooks/useSonioxRealtime.ts` — Owns mic capture (`getUserMedia`), the Soniox WebSocket, PCM conversion, and token parsing into final/interim/translation callbacks.
- `features/translation/hooks/useTranscript.ts` — In-memory entries + speaker labeling; `saveToServer` → `save_transcript`, `loadFromDb` → `get_meeting`, `updateLastTranslation` for late-arriving translation messages.
- `features/translation/hooks/useAudioRecorder.ts` — `MediaRecorder` wrapper; `waitForBlob()` promise resolves on `onstop` so MeetingRoom can save the final blob.
- `features/translation/hooks/useSpeakerMapping.ts` — Thin wrapper over `SpeakerLabeler` for label/mapping/reset.
- `features/translation/helpers/speakerLabeler.ts` — Assigns "Speaker N" labels in first-encounter order (language does not affect the label); exposes `getMapping()`.
- `features/translation/helpers/exportTranscript.ts` — Builds CSV/XLSX bytes in JS (cols: Time, Speaker, Language, Original, Translation) and calls `export_xlsx` to save.

### Services / Lib / i18n
- `modules/comtor/frontend/src/services/openai.service.ts` — `generateMeetingSummary()`: direct `fetch` to OpenAI chat completions; structured JSON summary; key passed in from keyring.
- `modules/comtor/frontend/src/lib/tauri.ts` — Typed `tauri.*` wrapper that namespaces every call to `plugin:comtor|<cmd>` and serializes byte arrays.
- `modules/comtor/frontend/src/lib/soniox.ts` — `SONIOX_CONFIG` (model `stt-rt-v4`, language hints `ja/vi/en/zh/ko`, diarization, language ID, two-way JA↔VI translation), WS + REST URLs.
- `modules/comtor/frontend/src/lib/i18n/{index.tsx,en.ts,ja.ts,vi.ts,types.ts}` — React-context i18n; default `vi`, locale persisted to `localStorage['vcomtor_locale']`.
- `modules/comtor/frontend/src/lib/{version.ts,changelog.ts,utils.ts}` — App version `0.1.0`, changelog seed entries, `cn()` class helper.
- `modules/comtor/frontend/src/App.tsx` / `main.tsx` — Shell with sidebar nav + first-run Soniox gate; providers (Theme, I18n, ErrorBoundary); bundles Quicksand fonts (Vietnamese subset).
- `modules/comtor/frontend/src/components/*` — `AppSidebar`, `LanguageSwitcher`, `ThemeProvider` (passthrough shim — theming is owned by the shared `@desk-launcher/theme` engine), `ErrorBoundary`, and `ui/*` primitives.

---

## DATABASE

### Tables
| Table | Purpose |
|---|---|
| `projects` | Top-level client/project grouping. |
| `meetings` | One interpreting session per row; references a project (cascade delete). |
| `transcript_entries` | Ordered utterances (original + translation) per meeting (cascade delete). |
| `app_meta` | Key/value metadata; holds `schema_version`. |

### Schema highlights
- `projects.{id,name,description,client_name,created_at,updated_at}` — `id` is a UUID TEXT PK; `meeting_count` is computed at query time, not stored.
- `meetings.status` — `in_progress` / `completed` (frontend type also allows `scheduled`); `meetings.mode` — `standard` (persisted) vs `private` (not saved).
- `meetings.summary` — JSON string of `{summary,keyPoints,actionItems}` (legacy plain-text summaries tolerated on read).
- `meetings.audio_path` — filename of the saved `.webm`; `meetings.speaker_mapping` — JSON of speakerId→{label,language}.
- `transcript_entries.{ord, speaker_id, speaker_label, speaker_number, language, original_text, translated_text, start_ms, end_ms, confidence, is_reply}` — `ord` defines display order; `is_reply` stored as 0/1 integer.
- **Where things live:** transcripts/meetings/projects → SQLite `vcomtor.db`; audio → `<module>/audio/<meetingId>.webm` files; prefs → `<module>/settings.json`; **API keys → OS keyring** (service `virtual_comtor`, accounts `soniox_api_key` / `openai_api_key`), never in the DB. All paths resolve under `launcher_paths::module_data_dir("comtor")` (`%APPDATA%\io.desklauncher\modules\comtor\`).

---

## WORKFLOW (live interpretation)
1. User opens a meeting (`MeetingPage` → `MeetingRoom`) and presses Start.
2. `useSonioxRealtime.start()` reads the Soniox key from the keyring (`get_soniox_key`), requests the mic (`getUserMedia`), opens the Soniox WebSocket, and sends a JSON config (model, PCM format at the live `AudioContext.sampleRate`, language hints, diarization, two-way JA↔VI translation).
3. A `ScriptProcessor` converts mic Float32 → Int16 PCM and streams it to Soniox; in parallel `useAudioRecorder` records the same stream to a WebM/Opus blob.
4. Soniox returns tokens; `handleMessage` groups them by speaker, separating originals from `translation_status="translation"` tokens, and fires `onFinalTokens` / `onInterimTokens` / `onTranslationOnly`.
5. `useTranscript` appends final entries (with a "Speaker N" label) and patches late-arriving translations onto the last entry; interim text renders live.
6. On Stop (standard mode): `save_transcript` persists entries → SQLite; `waitForBlob()` resolves the recording, which is written via `save_audio` and linked via `update_meeting({audioPath})`; the meeting is marked `completed`.
7. Optionally `MeetingSummary` sends the transcript to OpenAI (`generateMeetingSummary`) and stores the JSON summary via `update_meeting({summary})`.
8. Export: `exportToXLSX`/`exportToCSV` builds bytes in JS and `export_xlsx` saves them through a native dialog.

> Note: All external network calls (Soniox WS, OpenAI HTTPS) happen in the **frontend JS**. Rust only does persistence, keyring access, and file/dialog I/O — it never talks to Soniox or OpenAI.

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound (what invokes this module)
- Launcher host opens the `comtor` window → React app boots in `main.tsx` / `App.tsx`; first-run gate forces Settings if `sonioxKeySet` is false.
- Plugin registration + DB/audio-dir creation → `lib.rs::init()` → `db::init()` (creates `vcomtor.db` and `audio/`).
- All UI data flows in as `plugin:comtor|<cmd>` invokes routed through `lib/tauri.ts` to the Rust command handlers.
- Live recording loop: mic `onaudioprocess` callbacks → WS sends in `useSonioxRealtime`; `MediaRecorder.ondataavailable` chunks in `useAudioRecorder`.

### Outbound (what this module sets off)
- **Soniox real-time STT (frontend)** → `wss://stt-rt.soniox.com/transcribe-websocket` from `useSonioxRealtime.ts::start()` (and a transient validation socket in `SettingsPage.tsx::handleTestSoniox`).
- **OpenAI API (frontend)** → `https://api.openai.com/v1/chat/completions` from `openai.service.ts::generateMeetingSummary()`.
- **Keyring writes/reads** → service `virtual_comtor` from `settings.rs` (`set_/get_/clear_*_key`, `get_settings`).
- **Filesystem writes** → `audio/<meetingId>.webm` from `audio.rs::save_audio`; `settings.json` from `settings.rs::set_prefs`; arbitrary save-dialog path from `export.rs::export_xlsx`.
- **Native save dialog** → `tauri-plugin-dialog` from `export.rs::export_xlsx`.
- **DB mutations** → `vcomtor.db` from all project/meeting/transcript commands.
- **No Tauri events** are emitted or listened to by this module (verified — no `emit`/`listen` usage).

---

## NOTES / GOTCHAS
- **External services are called from frontend JS, not Rust.** Soniox and OpenAI never touch the backend; the Rust side is purely local persistence + keyring + files + dialog. CSP in `tauri.conf.json` (not the capability file) is what authorizes the HTTPS/WSS egress.
- **API keys are passed through the frontend.** `get_soniox_key`/`get_openai_key` return the *raw* key to JS so the browser can authenticate the Soniox WS and OpenAI fetch — keys leave the keyring into the renderer at runtime.
- **`private` mode meetings are not persisted.** In `MeetingRoom.handleStop`, transcript + audio saving is skipped for non-`standard` mode (only the `completed` status update runs); transcripts exist only in memory.
- **`save_transcript` is destructive/idempotent.** It deletes all existing entries for the meeting and rewrites them, re-deriving `ord` from array index — partial appends are not supported.
- **Speaker labeling is naive.** `SpeakerLabeler` assigns "Speaker N" purely by first-encounter order of Soniox `speaker` IDs; mis-diarization upstream propagates directly. Comments referencing JA→Customer/VI→Our grouping are stale — language no longer affects the label.
- **Legacy heritage / migration.** This module was plugin-ized from a standalone `virtual_comtor_desktop` Tauri app (per `Cargo.toml`); the DB is still `vcomtor.db`, keyring service `virtual_comtor`, and the locale key `vcomtor_locale`. No automatic migration from the old `%APPDATA%\com.vcomtor.desktop` data dir exists yet — it would be a manual/roadmap item.
- **View routing is ad-hoc.** Navigation is a `useState`-based view switch in `App.tsx` (no router); a proper view state machine is implied but not implemented.
- **`export_xlsx` is a generic byte-saver.** Despite the name it writes whatever bytes it's given (CSV export reuses it), and the `lastExportDir` pref is defined but not currently wired into the dialog.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [07-shared-infra](./07-shared-infra.md) — launcher-paths, shared UI

---
_Last updated: 2026-06-19 · Synced: desk-launcher@8351e8c · Format: v1_
