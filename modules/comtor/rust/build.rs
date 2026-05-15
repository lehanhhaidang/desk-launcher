// Auto-generates Tauri permission files for every plugin command.
// Without this, `tauri::plugin::Builder` registers handlers but they are
// rejected at the capability layer ("permission denied") and the frontend
// sees invokes silently fail. Capability files can then refer to
// `comtor:default` (allows everything) or `comtor:allow-<cmd>`.

const COMMANDS: &[&str] = &[
    // projects
    "list_projects",
    "get_project",
    "create_project",
    "update_project",
    "delete_project",
    // meetings
    "list_meetings",
    "list_recent_meetings",
    "get_meeting",
    "create_meeting",
    "update_meeting",
    "delete_meeting",
    "save_transcript",
    // audio
    "save_audio",
    "get_audio",
    "delete_audio",
    "audio_exists",
    // settings
    "get_settings",
    "get_soniox_key",
    "get_openai_key",
    "set_soniox_key",
    "set_openai_key",
    "clear_soniox_key",
    "clear_openai_key",
    "get_prefs",
    "set_prefs",
    // export
    "export_xlsx",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
