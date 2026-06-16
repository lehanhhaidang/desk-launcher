// Every `#[tauri::command]` exposed by the plugin must be listed here so the
// permission files are generated. Grows phase by phase (sessions, snippets,
// forwards come online in later milestones).
const COMMANDS: &[&str] = &[
    "list_hosts",
    "create_host",
    "update_host",
    "delete_host",
    "list_groups",
    "create_group",
    "delete_group",
    "open_session",
    "send_input",
    "resize_session",
    "close_session",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
