# TASK: Open Sesame & MD Converter — markdown image/code preview + open-binary + resizable split
_Created: 2026-06-05 · Status: done_

## Request
1. Markdown preview in **both** modules renders code blocks poorly (no syntax colors). → make code "đẹp".
2. **Open Sesame** markdown preview can't show images (local image paths don't load).
3. **Open Sesame**: clicking a binary file (Word/Excel/PPT/PDF/…) should open it in the OS default app instead of showing an error. Images + text/code preview inline.
4. **Markdown Converter**: add a draggable divider between the editor pane and the preview pane to rebalance widths.

_Clarified by user_: Markdown Converter does **not** need image viewing (converted Office images are placeholders the Rust side drops — out of scope). Open Sesame click behaviour = **images + text/code inline; everything else opens externally**.

## Request analysis
- Intent: feature (UI/UX enhancement)
- Modules involved: 03 Open Sesame, 06 Markdown Converter (frontend only)

## Current flow (verified in code)
- **Code rendering** — both `MarkdownDocument` components (`markdown-preview.tsx::MarkdownBody`, `MarkdownDocument.tsx::MarkdownBody`) already wire `rehype-highlight` and both CSS files already `@import "highlight.js/styles/github-dark.css"`. **Bug**: the custom `code` renderer applies inline-pill styling (`bg purple + text-[var(--primary)] + px padding`) to *block* code too (react-markdown v10 calls `code` for both inline and fenced), smothering the hljs token colors. → `markdown-preview.tsx:173`, `MarkdownDocument.tsx:115`.
- **Images** — neither `MarkdownDocument` overrides `img`; Open Sesame docs reference local relative paths the webview can't load. Precedent for local images elsewhere = read bytes → `URL.createObjectURL(new Blob([bytes]))` (`comtor AudioPlayer.tsx:59`, `video-downloader CropEditorDialog.tsx:122`). No module uses the asset protocol.
- **Binary click** — `file-tree.tsx::TreeNode` click → `explorer-layout.tsx::handleSelectFile` (and `handleSearchSelect`) → `MarkdownPreview` → `file_content` → `file_tree_service.rs::read_file_content` does `fs::read_to_string` and returns `AppError::Internal("File is not valid UTF-8 text")` for binaries → red error panel today. `openPath` from `@tauri-apps/plugin-opener` is already used (`doc-set-card.tsx:1,38`); capability already grants `opener:default` + `opener:allow-open-path` (scoped to `$HOME/.open-sesame/**`).
- **MD Converter layout** — `MdConverter.tsx:284` `<main className="grid … lg:grid-cols-2">` is a fixed 50/50 split, no divider. Open Sesame already has a pointer-drag resize pattern to copy: `explorer-layout.tsx:131 startSidebarResize` (+ localStorage persist).

## Findings / Gap
- Code: stop applying the inline pill to block code; let `hljs` token spans + the `pre` box show through.
- Images (OS only): add an `img` renderer that resolves local/relative `src` against the previewed file's directory and loads bytes via `@tauri-apps/plugin-fs::readFile` → blob URL; pass through `data:`/`http(s):`/`blob:` as-is.
- Binary click (OS): classify the clicked file → image (inline image viewer) · text/code (existing preview) · other (open via `openPath`, show an "opened externally" panel).
- Split (MDC): replace the fixed grid with a flex row + draggable separator, ratio persisted to `localStorage`.

## Coverage (proof this is complete)
- `MarkdownDocument` (Open Sesame) consumers grepped: `explorer-layout.tsx` (via `MarkdownPreview`) **and** `help-modal.tsx:56` (direct). → new `basePath` prop must be **optional** so help-modal keeps compiling; code fix benefits both.
- `MarkdownDocument` (MD Converter) consumer: only `MdConverter.tsx:334`.
- File-selection entry points grepped: `file-tree.tsx::onSelectFile` → `handleSelectFile`, and `handleSearchSelect`. Both will route through one new `selectNode()` so classification can't be bypassed.
- `code`/`pre` renderers exist only in the two `MarkdownDocument` files (grepped). No other markdown renderer.
- `openPath` ACL: files come from `sourcePath = mirror_path || source_path`; mirror is `$HOME/.open-sesame/mirrors/**` (covered), but an unmirrored `source_path` can sit anywhere → broaden `opener:allow-open-path` to `$HOME/**` (matches existing `fs:allow-read-file` scope).
- `readFile` (images) ACL: capability already has `fs:allow-read-file` for `$HOME/**` → covered for doc-sets/mirrors under home. Files outside `$HOME` won't load (noted limitation).
- Files actually read: both `MarkdownDocument`s, `MdConverter.tsx`, `explorer-layout.tsx`, `file-tree.tsx`, `file_tree_service.rs`, both capability JSONs, `tauri.conf.json`, host `lib.rs`, both CSS files, `package.json`.
- No Rust signature changes; `file_content` untouched.
- Unverified assumptions: **live runtime behaviour cannot be exercised here** (no desktop app run) — image rendering, `openPath`, and drag-resize are verified by type-check + code review only; user must smoke-test with `npm run dev`. (`unverified: runtime`)

## Plan — checklist (this is the contract; I will not silently deviate)
| # | Action (file → change) | How it will be verified | Status |
|---|---|---|---|
| 1 | NEW `modules/open-sesame/frontend/src/lib/file-kinds.ts` — `classifyFile(name)` → `'image'｜'text'｜'external'`; `IMAGE_EXTS`/`TEXT_EXTS`; `dirOf()`, `joinLocalPath()`, `mimeFromExt()`, `isRemoteOrData()` | `tsc -b` compiles; unit-reviewed ext sets | ✅ done |
| 2 | `markdown-preview.tsx` — add optional `basePath`; new `MarkdownImage` (local→readFile→blob, remote/data pass-through, revoke on unmount); fix `code` block vs inline | type-check; visual review of renderer | ✅ done |
| 3 | NEW `image-preview.tsx` — standalone image viewer (readFile→blob, fit-to-pane, error fallback) | type-check | ✅ done |
| 4 | `explorer-layout.tsx` — single `selectNode()` used by tree + search; route image→`ImagePreview`, text→`MarkdownPreview`, external→`openPath()` + info panel; pass `basePath` into preview | type-check; logic review of both entry points | ✅ done |
| 5 | `open-sesame/index.css` — add `.hljs.md-code-block{background:transparent;padding:0}` + base `img` styling | build picks up CSS | ✅ done |
| 6 | `apps/launcher/src-tauri/capabilities/open-sesame.json` — add `$HOME/**` to `opener:allow-open-path` | valid JSON; existing identifier | ✅ done |
| 7 | `md-converter/MarkdownDocument.tsx` — same block-vs-inline `code` fix (no image work) | type-check; visual review | ✅ done |
| 8 | `md-converter/MdConverter.tsx` — replace `lg:grid-cols-2` with flex + draggable separator; persist `md-converter:split-pct` (clamp 25–75%) | type-check; resize logic review | ✅ done |
| 9 | `md-converter/styles.css` — add `.hljs.md-code-block{…}` rule | build picks up CSS | ✅ done |
| 10 | Type-check the whole launcher build (`tsc -b`) for all touched module frontends | command output clean | ✅ done |

_Status legend: ✅ done · ◐ doing · ✅ done (+evidence) · ⚠️ done-unverified · ❌ blocked._

- Risk / cross-module impact: `MarkdownDocument` is shared with the Help modal (covered — optional prop). No Rust/host/registry changes. Capability edit is additive. No other module touched.

## Test plan
- No JS test runner exists (no vitest/jest in `package.json`); Rust untouched (so no `cargo`).
- Primary gate: `tsc -b` (launcher build type-check) over all module frontends.
- Manual smoke (user, `npm run dev`): (a) OS — open a `.md` with a local image → image shows; fenced code → colored; click a `.docx`/`.xlsx`/`.pdf` → opens in default app; click a `.png` → inline image; (b) MDC — code block colored; drag the middle divider → panes resize and the ratio persists across reopen.

## Definition of done
Every row ✅ with evidence · `tsc -b` clean · `MarkdownDocument` consumers still compile · runtime items explicitly flagged as user-smoke-test-pending.

## Closing reconciliation
- **Row 1** ✅ `lib/file-kinds.ts` created (classifyFile + IMAGE/TEXT sets + dirOf/resolveLocalPath/isRemoteOrData/mimeFromExt). Evidence: `tsc -b --force` clean.
- **Row 2** ✅ `markdown-preview.tsx`: optional `basePath`, `MarkdownImage` (local→readFile→blob, remote/data pass-through, revoke on unmount), block-vs-inline `code` fix. Evidence: type-check clean. (Note: original already imported `useEffect/useState` — first import edit failed, re-applied correctly.)
- **Row 3** ✅ `image-preview.tsx` created (readFile→blob, fit-to-pane, error fallback). Evidence: type-check clean.
- **Row 4** ✅ `explorer-layout.tsx`: `handleOpenExternal` + classification in `handleSelectFile`; `handleSearchSelect` now routes through it (dropped a dead no-op `invoke`); render branches image/external/text; `ExternalFilePanel` added. Evidence: type-check clean.
- **Row 5** ✅ `index.css`: `.hljs.md-code-block{background:transparent;padding:0}` appended.
- **Row 6** ✅ `open-sesame.json`: `opener:allow-open-path` now also allows `$HOME/**`. Valid JSON, existing identifier.
- **Row 7** ✅ `md-converter/MarkdownDocument.tsx`: same block-vs-inline `code` fix. Evidence: type-check clean.
- **Row 8** ✅ `MdConverter.tsx`: fixed grid → flex + draggable separator; `splitPct` state, `startSplitResize` (pointer-drag, clamp 25–75%), persisted to `md-converter:split-pct`. Evidence: type-check clean.
- **Row 9** ✅ `md-converter/styles.css`: `.hljs.md-code-block` rule appended.
- **Row 10** ✅ `npx tsc -b --force` (apps/launcher) → EXIT 0, no errors. Covers all module frontends.

### What was NOT tested (residual risk — needs `npm run dev`)
- **No desktop run was possible in this environment.** Type-checking is green, but live behaviour is unverified: (a) OS local-image rendering in Markdown + the `$HOME` readFile scope, (b) `openPath` actually launching Word/Excel/PPT/PDF, (c) standalone image viewer, (d) the `.hljs.md-code-block` CSS producing correct colors at runtime, (e) MDC divider drag + persistence. All are low-risk (follow existing precedents) but should be smoke-tested.
- **Known limitation (by design):** images outside `$HOME` won't load (readFile scope); MD Converter shows no images for converted Office docs (placeholders — per user, out of scope).

### Docs updated
- `modules/03-open-sesame.md` — KEY FEATURES (image/smart-open), explorer FRONTEND files, `lib/file-kinds.ts`, capability scope, 2 NOTES.
- `modules/06-md-converter.md` — KEY FEATURES (divider), MdConverter/MarkdownDocument descriptions.

### Pending
- User smoke-test with `npm run dev`. No commit made (not requested).
