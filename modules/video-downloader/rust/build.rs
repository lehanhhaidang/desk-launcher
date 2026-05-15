// Auto-generates Tauri permission files for every plugin command.

const COMMANDS: &[&str] = &[
    "video_info",
    "video_download_start",
    "video_download_cancel",
    "video_download_read",
    "video_download_cleanup",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
