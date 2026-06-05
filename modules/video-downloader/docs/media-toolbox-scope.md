# Media Toolbox Scope

## Product Direction

`video-downloader` should evolve into **Media Toolbox**: a focused desktop utility for capturing, converting, compressing, and preparing media files.

The current URL downloader remains the first workflow, but it becomes one part of a broader media app instead of a single-purpose downloader.

## Core Jobs

Media Toolbox should help users:

- Capture video or audio from supported URLs.
- Convert images between common formats.
- Resize and compress images for sharing or publishing.
- Convert, compress, trim, and extract audio from local videos.
- Run batch jobs with clear progress and recoverable errors.

## Navigation Model

The module should use top-level tabs:

- **Capture**: current URL download workflow.
- **Images**: local image conversion, resize, compression.
- **Videos**: local video conversion, compression, trim, audio extraction.
- **Queue**: job history, current progress, completed outputs.

The first implementation can ship with only `Capture` and `Images`. `Videos` and `Queue` can be visible later when functional.

## Phase 1: Rename And Structure

Goal: prepare the current downloader to become Media Toolbox without breaking current behavior.

Scope:

- Rename visible UI from `Video Downloader` to `Media Toolbox`.
- Move the existing downloader screen into a `Capture` tab.
- Keep the current yt-dlp and ffmpeg backend commands unchanged.
- Keep local shadcn components inside the module.
- Preserve current download, cancel, progress, and save behavior.

Out of scope:

- Local image processing.
- Local video processing.
- Queue persistence.

## Phase 2: Image Tools MVP

Goal: add a practical image workflow that works well for batches.

Features:

- Drag and drop images.
- File picker fallback.
- Batch list with filename, dimensions, format, and size.
- Output format: PNG, JPEG, WebP.
- Resize controls: width, height, preserve aspect ratio.
- Compression controls: quality slider for JPEG/WebP.
- Strip metadata toggle.
- Output naming pattern.
- Export all.

Recommended MVP constraints:

- No advanced crop editor yet.
- No watermark yet.
- No per-image settings yet.
- Apply one setting group to all selected images.

## Phase 3: Video Tools MVP

Goal: add local video utilities using ffmpeg.

Features:

- Drop or select local video files.
- Read metadata: duration, resolution, fps, codec, bitrate, file size.
- Convert format: MP4, WebM, MOV.
- Compress preset: High Quality, Balanced, Small.
- Extract audio: MP3, M4A, WAV.
- Basic trim: start time and end time fields.
- Export with progress and cancel.

Recommended MVP constraints:

- Avoid timeline editing in the first pass.
- Avoid frame-accurate trim UI initially.
- Keep preview simple: filename, thumbnail if cheap, metadata.

## Phase 4: Queue And History

Goal: unify Capture, Images, and Videos under one job system.

Features:

- Active jobs with progress, cancel, and status.
- Completed jobs with output file path and save/open actions.
- Failed jobs with readable error details.
- Clear completed jobs.
- Retry failed jobs.

This should be designed after image/video workflows exist, because the job model should match real processing needs.

## Non-Goals

Media Toolbox should not become:

- A full video editor.
- A full photo editor.
- A DAM/media library.
- A cloud upload manager.
- A timeline-based editor.

The app should stay fast, local, focused, and predictable.

