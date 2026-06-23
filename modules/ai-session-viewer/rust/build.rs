const COMMANDS: &[&str] = &[
    "list_providers",
    "list_projects",
    "list_sessions",
    "read_session",
    "delete_session",
    "rename_session",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
