# MODULE: MARKDOWN CONVERTER

## OVERVIEW
The Markdown Converter is a pure-Rust Tauri plugin that converts Office, PDF, HTML, EPUB, Jupyter notebook, and plain-data files into Markdown — a partial Rust port of Microsoft's MarkItDown core. It exposes four commands (`convert_file`, `convert_text`, `convert_batch`, `supported_extensions`) backed by per-format converter modules built on `calamine`, `zip`, `quick-xml`, `htmd`, and `pdf-extract`. The module is fully stateless: it reads input files and returns Markdown strings (batch mode also writes `.md` files), with no database or persistent state.

---

## KEY FEATURES
- **15+ formats to Markdown**: DOCX, XLSX/XLS, PPTX, PDF, HTML/HTM, MD/Markdown, TXT, CSV, JSON, XML, EPUB, IPYNB, and ZIP archives.
- **MarkItDown-faithful rendering**: DOCX field-code stripping + hyperlink resolution, PPTX `<!-- Slide number: N -->` headers and `### Notes:` sections, IPYNB code-cell fencing — all mirroring the Python reference.
- **Single-file live preview + edit**: convert one file, edit the raw Markdown in a textarea, and see a rendered preview (react-markdown + GFM + highlight.js syntax-highlighted code blocks) side by side, with a **draggable divider** to rebalance the editor/preview widths (ratio persisted to `localStorage`).
- **Batch-to-disk conversion**: `convert_batch` writes one `.md` per input into an output folder with collision-safe `-1`, `-2` suffixes (unless overwrite is set).
- **Drag-and-drop + folder recursion**: drop files or whole folders; the frontend recurses directories and filters to supported extensions before invoking.
- **Encoding-aware plain text**: strips UTF-8 BOM, falls back to Windows-1252 for non-UTF-8 byte streams.

---

## BACKEND FILES

### Plugin / Commands
| File | Description |
|---|---|
| `modules/md-converter/rust/src/lib.rs` | Plugin entry (`init()` registers `md-converter` plugin). Defines the 4 commands, `detect_format()` (extension → normalized format, with `htm`→`html`, `markdown`→`md` aliases), `convert_one_to_disk()` (batch write + collision suffixing), result/request structs, and `ConvertError` Display impl. |
| `modules/md-converter/rust/src/converters/mod.rs` | Converter registry. `convert_path(path, format)` dispatches by normalized extension to each converter; `convert_text(content, format)` handles in-memory conversion for txt/md/csv/json/xml/html only. Declares the `ConvertError` enum (Io / Parse / Unsupported). |

### Converters
| File | Extensions | How it converts |
|---|---|---|
| `converters/plain.rs` | txt, md | Reads bytes, strips UTF-8 BOM, decodes UTF-8 (or Windows-1252 fallback). MD passes through unchanged. |
| `converters/tabular.rs` | csv | `csv` crate reads flexible, header-less rows → `rows_to_markdown()` (pipe table). Also hosts the shared `rows_to_markdown` / `escape_pipe` helpers used by xlsx/docx/pptx/json. |
| `converters/json.rs` | json | If top level is an array of ≤1000 flat objects, emits a Markdown table; otherwise pretty-prints inside a ` ```json ` fence. |
| `converters/xml.rs` | xml | Wraps the raw content (trimmed) inside a ` ```xml ` fence — no structural parsing. |
| `converters/html.rs` | html, htm | `htmd` HTML→Markdown. Pre-strips `script/style/noscript/head`, slices to `<body>…</body>` if present, truncates long `data:` base64 URIs to `data:<mime>;base64,...`. |
| `converters/docx.rs` | docx | Opens the DOCX zip, parses `word/document.xml` with `quick-xml`. Resolves hyperlinks via `document.xml.rels`, strips field instruction text (TOC/PAGEREF), maps Heading1-6/Title → `#`..`######`, lists with nested indent, bold/italic runs, tables, and image placeholders. Rejects legacy `.doc` (OLE/CFBF signature). |
| `converters/xlsx.rs` | xlsx, xls | `calamine` `open_workbook_auto`. Each non-empty sheet → `## <name>` heading + Markdown table; numeric/date cells formatted via `cell_to_string`. |
| `converters/pptx.rs` | pptx | Opens the PPTX zip, sorts `ppt/slides/slideN.xml`. Each slide → `<!-- Slide number: N -->`, title placeholder → `# `, text runs, picture placeholders, `<a:tbl>` tables, and `ppt/notesSlides/notesSlideN.xml` → `### Notes:`. Rejects legacy `.ppt`. |
| `converters/pdf.rs` | pdf | `pdf-extract` text-only extraction; normalizes CRLF and collapses 3+ newlines to 2. No layout/table reconstruction. |
| `converters/epub.rs` | epub | EPUB-as-zip: reads `META-INF/container.xml` → OPF, parses manifest + spine for chapter order, converts each XHTML chapter via `htmd::convert`. No heavy EPUB crate. |
| `converters/ipynb.rs` | ipynb | Parses notebook JSON with `serde_json`. Markdown cells verbatim, code cells → ` ```python ` fence (hardcoded), raw cells → bare fence. Cell outputs are dropped. |
| `converters/zip.rs` | zip | Walks archive entries; emits `# Archive: <name>` then `### <path>` per file. Converts txt/md/csv/json/html/xml inline; Office formats and nested archives are skipped (`_skipped: .<ext> entry_`) to avoid temp extraction. |

### Build / Permissions / Capability
| File | Description |
|---|---|
| `modules/md-converter/rust/Cargo.toml` | Crate `tauri-plugin-md-converter`. Deps: `calamine 0.26`, `zip 2.2` (deflate), `quick-xml 0.36`, `htmd 0.1`, `pdf-extract 0.7`, `csv 1.3`, `encoding_rs 0.8`, plus tauri/serde/serde_json/log/thiserror. |
| `modules/md-converter/rust/build.rs` | Declares `COMMANDS = [convert_file, convert_text, convert_batch, supported_extensions]` and runs `tauri_plugin::Builder` to autogenerate permission files. |
| `modules/md-converter/rust/permissions/default.toml` | `default` permission set allowing all four commands (`allow-convert-file`, `allow-convert-text`, `allow-convert-batch`, `allow-supported-extensions`). |
| `apps/launcher/src-tauri/capabilities/md-converter.json` | Capability for the `md-converter` window: grants `core:default`, `dialog:default`, `fs:default`, `log:default`, `md-converter:default`. |

---

## API ENDPOINTS (Tauri commands, invoked as `plugin:md-converter|<command>`)
| Command | Params | Returns | Description |
|---|---|---|---|
| `convert_file` | `path: String` | `ConvertResult { markdown, title?, source_path?, format }` | Detects format from extension, reads the file, converts to Markdown. `title` = file stem, `source_path` = the input path. Errors as a `String` for unsupported/invalid files. |
| `convert_text` | `request: TextConvertRequest { content, format, filename? }` | `ConvertResult` (`source_path` = null, `title` = filename) | In-memory conversion of a string. Supports only txt, md, csv, json, xml, html (others → unsupported error). |
| `convert_batch` | `request: BatchRequest { paths[], output_dir, overwrite? }` | `Vec<BatchEntry { source_path, output_path?, success, error?, format? }>` | Creates `output_dir` if needed, converts each path and writes `<stem>.md` (collision-safe `-1`/`-2` unless `overwrite`). Returns a per-file result list; never throws for individual failures. |
| `supported_extensions` | (none) | `Vec<String>` | Returns the raw supported extension list: `docx, xlsx, xls, pptx, pdf, html, htm, md, markdown, txt, csv, json, xml, epub, ipynb, zip`. |

---

## SUPPORTED FORMATS
| Extension(s) | Converter | Notes / limitations |
|---|---|---|
| `.docx` | docx.rs | No footnotes/endnotes, comments, equations (OMML), embedded objects, text boxes, or style-map; images become `![alt](name.jpg)` placeholders. Legacy `.doc` rejected with a guidance message. |
| `.xlsx`, `.xls` | xlsx.rs | One Markdown table per sheet; dates rendered as serial/ISO values, no formula evaluation (cached values only). |
| `.pptx` | pptx.rs | No charts, group-shape recursion, position sorting, or image captions; pictures → filename placeholders. Legacy `.ppt` rejected. |
| `.pdf` | pdf.rs | Text-only, no layout/table/heading reconstruction; OCR not supported (no text layer = empty/garbled output). |
| `.html`, `.htm` | html.rs | `script/style/head` stripped, base64 data URIs truncated; no title extraction (title comes from filename). |
| `.md`, `.markdown` | plain.rs | Pass-through with encoding normalization. |
| `.txt` | plain.rs | Encoding-detected plain text (UTF-8 / Windows-1252 fallback). |
| `.csv` | tabular.rs | First row treated as header; flexible column counts. (No `.tsv` — not in the supported list despite the brief's mention.) |
| `.json` | json.rs | Array-of-flat-objects → table (≤1000 rows); otherwise fenced pretty-printed JSON. |
| `.xml` | xml.rs | Dumped verbatim inside a fenced code block (no parsing). |
| `.epub` | epub.rs | Chapters in spine order via `htmd`; images/CSS skipped, no cover/metadata page. |
| `.ipynb` | ipynb.rs | Markdown/code/raw cells only; outputs dropped; code language hardcoded to `python`. |
| `.zip` | zip.rs | Recurses one level; converts text/csv/json/html/xml entries; Office + nested archives skipped. |

---

## FRONTEND FILES

### Root / Tabs
- `modules/md-converter/frontend/src/MdConverter.tsx` — The live root component (rendered by `apps/launcher/modules-pages/md-converter/main.tsx`). A single split-pane workspace: left = editable raw-Markdown textarea, right = live `MarkdownDocument` preview, with a **draggable separator** between them (pointer-drag, clamped 25–75%, persisted to `localStorage` key `md-converter:split-pct`). Supports choose-files / choose-folder dialogs, native drag-drop (files or folders, recursed via `readDir`), a multi-file selector dropdown, and Copy / Save-as-`.md` actions. It calls `convert_file` per path (not `convert_batch`) and `supported_extensions` on mount.
- `modules/md-converter/frontend/src/components/SingleTab.tsx` — Standalone single-file tab (Vietnamese UI strings): pick/drop a file → `convert_file` → `<pre>` preview + Copy / Save. **Not mounted by the current root** (no importer found); kept as an alternate UI.
- `modules/md-converter/frontend/src/components/BatchTab.tsx` — Standalone batch tab: add files + pick output folder + overwrite toggle → `convert_batch` → success/fail results list. **Not mounted by the current root**; it is the only caller of `convert_batch`.

### Components / API / Types
- `modules/md-converter/frontend/src/components/MarkdownDocument.tsx` — Rendered preview: `react-markdown` + `remark-gfm` + `rehype-highlight`, with custom styled headings/tables/code/links and Mermaid-block detection. Distinguishes block vs inline code so fenced blocks keep highlight.js token colors (only inline code gets the rounded pill). Falls back to a `<pre>` block for non-Markdown content.
- `modules/md-converter/frontend/src/api/md-api.ts` — Thin `invoke` wrappers for the four commands under the `plugin:md-converter|` namespace (`convertFile`, `convertText`, `convertBatch`, `supportedExtensions`).
- `modules/md-converter/frontend/src/types/md.types.ts` — TypeScript mirrors of the Rust structs: `ConvertResult`, `BatchEntry`, `BatchRequest`, `TextConvertRequest`.
- `modules/md-converter/frontend/src/styles.css` — Module-scoped theme (panels, editor, primary button, luxe text).

---

## DATABASE / STORAGE
Stateless — there is no SQLite, no `tauri-plugin-sql`, and no in-memory plugin state (no `AppState`/`Mutex`/`State<>`; grep confirms none). The plugin only reads input files and returns Markdown strings. The only writes are in `convert_batch`, which creates the output directory (if missing) and writes `<stem>.md` files to disk; the single-file UI writes a `.md` only when the user explicitly chooses Save (frontend `writeTextFile`). No temp files are created — even ZIP recursion is done in memory rather than extracting to disk.

---

## WORKFLOW

### Single conversion
1. User clicks **Choose files** / **Choose folder** or drags a file/folder onto the window.
2. `MdConverter.tsx` expands folders (`readDir` recursion), filters to supported extensions, and for each path calls `convertFile(path)` → `plugin:md-converter|convert_file`.
3. `lib.rs::convert_file` runs `detect_format` → `converters::convert_path` → returns `ConvertResult`.
4. The raw Markdown lands in the editable textarea; `MarkdownDocument` renders the live preview.
5. User edits if desired, then **Copy** (clipboard) or **Save** (Save dialog → `writeTextFile`).

### Batch conversion
1. (Via the standalone `BatchTab`) user adds multiple files and picks an output folder, optionally enabling overwrite.
2. `convertBatch({ paths, output_dir, overwrite })` → `plugin:md-converter|convert_batch`.
3. `lib.rs::convert_batch` ensures the output dir exists, then `convert_one_to_disk` for each path: convert, write `<stem>.md` (suffixing `-1`/`-2` on collision unless overwrite), and record a `BatchEntry`.
4. The UI shows a per-file success/fail list with output paths and errors.

---

## TRIGGERS & SIDE EFFECTS (hidden flows)

### Inbound (what invokes this module)
- `convert_file` (per picked/dropped file) → `MdConverter.tsx` / `SingleTab.tsx` → handled in `lib.rs::convert_file()`.
- `convert_batch` (batch run) → `BatchTab.tsx` → handled in `lib.rs::convert_batch()` (currently only reachable via the unmounted BatchTab).
- `convert_text` (in-memory string) → exposed in `md-api.ts::convertText` but **no UI caller** found.
- `supported_extensions` (on mount) → `MdConverter.tsx` → handled in `lib.rs::supported_extensions()`.

### Outbound (what this module sets off)
- File reads: every converter opens/reads the input path (`std::fs::File::open` / `fs::read` / `fs::read_to_string`) — in `converters/*.rs`.
- File writes: `lib.rs::convert_one_to_disk()` writes `<stem>.md` and `convert_batch` may `create_dir_all(output_dir)`. The single-file UI additionally writes via the frontend `writeTextFile` on Save (not a plugin command).
- No network, no spawned processes, no shared state.

---

## NOTES / GOTCHAS
- **Partial MarkItDown port**: image OCR and audio transcription are intentionally excluded (would need an LLM/API key). Image content in DOCX/PPTX becomes filename placeholders, not extracted files.
- **`convert_text` is HTML/text-only**: it rejects docx/pdf/xlsx/etc. (those need a file path); the live root never calls it.
- **PDF is text-layer only**: scanned/image PDFs yield empty or garbled output — no OCR fallback. Likewise `pdf-extract` does not reconstruct tables or headings.
- **TSV is not supported** despite being mentioned in passing — `SUPPORTED_EXTS` lists `csv` but not `tsv`; the `tabular.rs` module only wires CSV.
- **ZIP recursion is shallow**: nested archives and Office files inside a ZIP are skipped (marked `_skipped`), so a `.zip` of `.docx` files yields placeholders, not converted content.
- **IPYNB title/outputs**: extracted notebook title is computed but never threaded into `ConvertResult` (title always derives from filename stem); cell outputs are discarded.
- **Encoding**: plain text/MD strip a UTF-8 BOM and fall back to Windows-1252; other converters assume UTF-8 inner XML/text.
- **Two unmounted tab components** (`SingleTab`, `BatchTab`) duplicate functionality of the active root and contain Vietnamese UI strings — the only path to `convert_batch` currently runs through the unmounted `BatchTab`.

---

## RELATED MODULES
- [01-launcher-host](./01-launcher-host.md) — host that spawns this window
- [07-shared-infra](./07-shared-infra.md) — shared UI primitives (`@desk-launcher/ui`)

---
_Last updated: 2026-06-05 · Synced: desk-launcher@acbb5c5 · Format: v1_
