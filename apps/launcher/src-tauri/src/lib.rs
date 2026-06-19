mod backup;
mod module_registry;
mod window_manager;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // Module plugins:
        .plugin(tauri_plugin_myssh::init())
        .plugin(tauri_plugin_open_sesame::init())
        .plugin(tauri_plugin_comtor::init())
        .plugin(tauri_plugin_video_downloader::init())
        .plugin(tauri_plugin_md_converter::init())
        .invoke_handler(tauri::generate_handler![
            window_manager::open_module,
            window_manager::close_module,
            window_manager::list_open_modules,
            module_registry::list_modules,
        ])
        .setup(|app| {
            log::info!("Desk Launcher booting");
            log::info!(
                "App data dir: {}",
                app.path()
                    .app_data_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "<unknown>".into())
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
