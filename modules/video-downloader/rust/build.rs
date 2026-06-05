// Auto-generates Tauri permission files for every plugin command.
//
// Each entry becomes an `allow-<command-kebab>` permission that capability
// files reference via the `video-downloader:default` permission set.

const COMMANDS: &[&str] = &[
    // Capture
    "video_info",
    "video_download_start",
    "video_download_cancel",
    "video_download_read",
    "video_download_cleanup",
    // Images
    "media_image_probe",
    "media_image_read_bytes",
    "media_image_process_start",
    "media_image_process_cancel",
    "media_image_process_cleanup",
    // Videos
    "media_video_probe",
    "media_video_process_start",
    "media_video_process_cancel",
    "media_video_process_cleanup",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
