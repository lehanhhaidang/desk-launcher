// Auto-generates Tauri permission files for every plugin command.

const COMMANDS: &[&str] = &[
    "convert_file",
    "convert_text",
    "convert_batch",
    "supported_extensions",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
