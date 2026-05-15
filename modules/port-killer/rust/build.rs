// Auto-generates Tauri permission files for every plugin command.
// See modules/comtor/rust/build.rs for the why.

const COMMANDS: &[&str] = &[
    "list_ports",
    "kill_ports",
    "list_tunnels",
    "create_tunnel",
    "update_tunnel",
    "delete_tunnel",
    "start_tunnel",
    "stop_tunnel",
    "list_ssh_keys",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
