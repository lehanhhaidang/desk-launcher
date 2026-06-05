//! Media Toolbox Tauri plugin.
//!
//! Crate name is `tauri-plugin-video-downloader` for historical reasons — the
//! module identifier is still `video-downloader`, but the surface area covers
//! three workflows:
//!
//! * **Capture** — URL-driven downloads via bundled `yt-dlp.exe` + `ffmpeg.exe`
//!   sidecars (see [`capture`]).
//! * **Images** — local batch convert / resize / compress using the `image`
//!   crate (see [`image`]).
//! * **Videos** — local conversion / compression / trim / audio extraction
//!   through the `ffmpeg.exe` sidecar (see [`video`]).
//!
//! Each workflow owns its own state and Tauri events. The frontend listens to
//! per-feature event channels declared in [`events`] and surfaces a unified
//! Queue view from those streams.

mod capture;
mod events;
mod image;
mod paths;
mod state;
mod video;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Wry};

use crate::state::{CaptureState, ImageState, VideoState};

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("video-downloader")
        .invoke_handler(tauri::generate_handler![
            // Capture
            capture::video_info,
            capture::video_download_start,
            capture::video_download_cancel,
            capture::video_download_read,
            capture::video_download_cleanup,
            // Images
            image::media_image_probe,
            image::media_image_read_bytes,
            image::media_image_process_start,
            image::media_image_process_cancel,
            image::media_image_process_cleanup,
            // Videos
            video::media_video_probe,
            video::media_video_process_start,
            video::media_video_process_cancel,
            video::media_video_process_cleanup,
        ])
        .setup(|app, _api| {
            app.manage(CaptureState::default());
            app.manage(ImageState::default());
            app.manage(VideoState::default());
            log::info!("video-downloader plugin initialized");
            Ok(())
        })
        .build()
}
