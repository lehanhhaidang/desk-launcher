// Auto-generates Tauri permission files for every plugin command.
// See modules/comtor/rust/build.rs for the why.

const COMMANDS: &[&str] = &[
    // auth
    "auth_github_start",
    "auth_github_poll",
    "auth_list_accounts",
    "auth_logout",
    // workspace
    "workspace_list",
    "workspace_create",
    "workspace_update",
    "workspace_delete",
    // doc_set
    "doc_set_detect_strategy",
    "doc_set_create",
    "doc_set_list",
    "doc_set_list_all",
    "doc_set_delete",
    "doc_set_move",
    "doc_set_set_auto_sync",
    "doc_set_setup_github_remote",
    "doc_set_import_from_github",
    "doc_set_sources",
    "doc_set_mapping_preflight",
    "doc_set_set_source_mapping",
    "doc_set_add_source",
    "doc_set_add_mirror_source",
    "doc_set_remove_new_mirror_path",
    "doc_set_refresh_mirror",
    "doc_set_restore_local_from_mirror",
    "doc_set_keep_both_local_changes",
    "doc_set_push_from_local",
    "doc_set_pull_from_repo",
    "doc_set_watch_start",
    "doc_set_watch_stop",
    "config_export",
    "config_import",
    // sync
    "sync_up",
    "sync_down",
    "sync_force_push",
    "sync_force_pull",
    "sync_status",
    "sync_logs",
    // files
    "file_tree",
    "file_content",
    "file_search",
    "file_toggle_bookmark",
    "file_list_bookmarks",
    "write_text_file",
    "read_text_file",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
