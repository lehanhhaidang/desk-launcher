# Media Toolbox Implementation Notes

## Current State

The module currently provides a URL-based downloader:

- Frontend entry: `frontend/src/VideoDownloader.tsx`
- API bridge: `frontend/src/api/video-api.ts`
- Tauri plugin: `rust/src/lib.rs`
- Local UI primitives: `frontend/src/components/ui`
- Backend tools: yt-dlp and ffmpeg sidecars

The existing downloader should be preserved as the `Capture` workflow.

## Suggested Frontend Structure

Recommended future structure:

```text
frontend/src/
  MediaToolbox.tsx
  features/
    capture/
      CaptureTab.tsx
      components/
      api/
      types.ts
    images/
      ImagesTab.tsx
      components/
      api/
      types.ts
    videos/
      VideosTab.tsx
      components/
      api/
      types.ts
    queue/
      QueueTab.tsx
      job-store.ts
  components/ui/
  styles.css
```

Migration path:

1. Keep `VideoDownloader.tsx` as a thin wrapper temporarily.
2. Add `MediaToolbox.tsx`.
3. Move current URL workflow into `features/capture/CaptureTab.tsx`.
4. Update registry/window title later when the product rename is accepted.

## Backend Shape

Capture can keep current commands:

- `video_info`
- `video_download_start`
- `video_download_cancel`
- `video_download_read`
- `video_download_cleanup`

Image and video tools should use new command groups rather than overloading capture commands.

Potential image commands:

- `media_image_probe`
- `media_image_process_start`
- `media_image_process_cancel`
- `media_image_process_read`
- `media_image_process_cleanup`

Potential video commands:

- `media_video_probe`
- `media_video_process_start`
- `media_video_process_cancel`
- `media_video_process_read`
- `media_video_process_cleanup`

This keeps capture-specific yt-dlp behavior separate from local file processing.

## Job Model

Use a shared job shape once more workflows exist:

```ts
type MediaJobStatus =
  | 'queued'
  | 'running'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface MediaJob {
  id: string
  type: 'capture' | 'image' | 'video'
  label: string
  status: MediaJobStatus
  progress: number
  input: string
  output?: string
  error?: string
}
```

Do not introduce a global queue before there are at least two workflows using it.

## Image Processing Options

Possible implementation options:

- Rust `image` crate for basic resize/convert.
- Rust `rexif` or similar crate for metadata reading if needed.
- Strip metadata by re-encoding output.

Recommended first pass:

- Decode image.
- Resize if requested.
- Re-encode as PNG/JPEG/WebP.
- Return output bytes or save to temp task file.

## Video Processing Options

Use ffmpeg sidecar for local video processing.

Recommended first pass:

- Probe metadata with `ffprobe` if available, or ffmpeg output parsing if not.
- Start ffmpeg process for convert/compress/extract/trim.
- Emit progress events.
- Allow cancel by killing child process.

Avoid making the video workflow depend on yt-dlp.

## File Handling

For local tools, prefer this flow:

1. User selects or drops local files in the frontend.
2. Frontend passes file paths to Tauri command.
3. Backend writes output to module temp/output directory.
4. Frontend lets user save/open output.

Do not keep large media bytes in React state.

## Safety And UX

Important behaviors:

- Every long-running job needs cancel.
- Errors must name the failed file and action.
- Batch jobs should continue after one file fails.
- Output naming should avoid overwriting by default.
- Export actions must be disabled until settings are valid.

## Rename Checklist

When the product rename is implemented:

- Rename visible title to `Media Toolbox`.
- Rename route/window title in launcher registry.
- Keep module id as `video-downloader` until migration risk is acceptable.
- Update user-facing descriptions from video-only to media-focused.
- Preserve compatibility with existing Tauri permissions.

