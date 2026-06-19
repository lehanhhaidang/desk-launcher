//! Virtual Comtor as a Tauri 2 plugin.
//!
//! Frontend invokes commands via `invoke('plugin:comtor|<command>', ...)`.
//! DB connection is managed inside the plugin via `app.manage::<DbState>()`
//! so it stays isolated from other modules.

pub mod backup;
mod audio;
mod db;
mod error;
mod export;
mod meetings;
mod projects;
mod settings;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Wry};

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("comtor")
        .invoke_handler(tauri::generate_handler![
            // projects
            projects::list_projects,
            projects::get_project,
            projects::create_project,
            projects::update_project,
            projects::delete_project,
            // meetings
            meetings::list_meetings,
            meetings::list_recent_meetings,
            meetings::get_meeting,
            meetings::create_meeting,
            meetings::update_meeting,
            meetings::delete_meeting,
            meetings::save_transcript,
            // audio
            audio::save_audio,
            audio::get_audio,
            audio::delete_audio,
            audio::audio_exists,
            // settings
            settings::get_settings,
            settings::get_soniox_key,
            settings::get_openai_key,
            settings::set_soniox_key,
            settings::set_openai_key,
            settings::clear_soniox_key,
            settings::clear_openai_key,
            settings::get_prefs,
            settings::set_prefs,
            // export
            export::export_xlsx,
        ])
        .setup(|app, _api| {
            log::info!("comtor plugin: initializing");
            let state = db::init().map_err(|e| format!("comtor db init: {e}"))?;
            app.manage(state);
            Ok(())
        })
        .build()
}
