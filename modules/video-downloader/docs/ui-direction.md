# Media Toolbox UI Direction

## Design Principles

Media Toolbox should feel like a compact professional desktop utility:

- Dark interface with strong contrast.
- Clear panels, not decorative landing-page sections.
- Controls grouped by workflow.
- Cards used for files, jobs, settings panels, and previews.
- No nested cards.
- No giant hero area.
- No explanatory marketing copy inside the app.
- Primary actions should be visually strong and easy to scan.

## Layout

Recommended app frame:

```text
Media Toolbox
Capture | Images | Videos | Queue

[Workflow-specific content]
```

Each tab should use a two-zone layout when useful:

```text
Main work area                    Settings / actions
-----------------------------------------------------
Drop zone, preview, file list      Output format
Job progress                       Quality
Results                            Export action
```

For narrow windows, settings move below the main work area.

## Capture Tab

The current downloader becomes `Capture`.

Primary sections:

- URL input row.
- Supported platforms row.
- Metadata preview.
- Output controls.
- Download action.

Suggested visible text:

- Section label: `Media capture`
- Main heading: `Capture from a link`
- Input placeholder: `Paste a video URL...`
- Primary action: `Fetch`
- Download action: `Download MP4` / `Download MP3`

The current large preview card is a good pattern to keep.

## Images Tab

Recommended structure:

```text
Images

[Drop images here]

[File list]
filename | dimensions | format | size | status

[Settings]
Format: PNG/JPEG/WebP
Resize: width/height, preserve aspect ratio
Quality: slider
Metadata: strip metadata toggle
Naming: pattern input

[Export Images]
```

The image tab should prioritize batch operations. Individual image editing can come later.

Drop zone rules:

- Large enough to be obvious.
- Accept click-to-browse.
- Show selected count immediately.
- Do not use vague copy.

Suggested copy:

- `Drop images here`
- `Choose files`
- `Output settings`
- `Export images`
- `Clear list`

## Videos Tab

Recommended structure:

```text
Videos

[Drop videos here]

[Selected video / file list]
filename | duration | resolution | size | status

[Settings]
Action: Convert / Compress / Extract audio / Trim
Format or preset controls
Time range controls for trim

[Export Video]
```

Keep video UI practical and restrained. Avoid a timeline editor until the core ffmpeg workflow is stable.

Suggested copy:

- `Drop videos here`
- `Video action`
- `Compression preset`
- `Extract audio`
- `Export video`

## Queue Tab

Queue should feel operational, not decorative.

Recommended columns:

- Job
- Type
- Status
- Progress
- Output
- Actions

Actions:

- Cancel
- Retry
- Open output
- Clear

## Visual Style

Base surface:

- Background: deep navy / slate.
- Panels: dark translucent slate.
- Borders: subtle blue-gray.
- Primary action: strong blue neon with white text.
- Danger action: restrained red, not oversized.
- Success action: emerald only for completed state.

Avoid:

- Purple-heavy gradients.
- Beige or brown palettes.
- Overly bright full-screen glows.
- Tiny text inside pills.
- Badges that wrap or overflow.

## Component Rules

Use local shadcn-style components in this module, not shared UI imports, so the module can be customized independently.

Required primitives:

- Button
- Input
- Badge
- Tabs
- Select
- Dialog
- Slider
- Switch
- Progress

For controls:

- Use icon buttons only for compact actions with clear tooltips.
- Use segmented controls for mutually exclusive modes.
- Use switches for binary settings.
- Use sliders for quality/compression.
- Use select/dropdown only for short option lists.

## Text Sizing

Recommended sizing:

- App title: 24px.
- Section headings: 18px.
- Card title: 14-15px.
- Body text: 13px.
- Table/file list text: 13-14px.
- Badges: 11-12px, single line only.
- Primary action text: 15-16px.

Never let button or badge text overflow. If content is long, truncate with title tooltip.

