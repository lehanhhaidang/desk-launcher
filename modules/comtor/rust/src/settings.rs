use crate::error::{AppError, AppResult};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const SERVICE: &str = "virtual_comtor";
const ACCOUNT_SONIOX: &str = "soniox_api_key";
const ACCOUNT_OPENAI: &str = "openai_api_key";

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub last_export_dir: Option<String>,
    #[serde(default = "default_summary_model")]
    pub summary_model: String,
}

fn default_locale() -> String {
    "vi".into()
}

fn default_summary_model() -> String {
    "gpt-4o-mini".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub soniox_key_set: bool,
    pub openai_key_set: bool,
    pub prefs: Prefs,
}

fn prefs_path() -> AppResult<PathBuf> {
    let dir = launcher_paths::module_data_dir("comtor")
        .map_err(|e| AppError::Internal(format!("module data dir: {e}")))?;
    Ok(dir.join("settings.json"))
}

fn read_prefs() -> AppResult<Prefs> {
    let path = prefs_path()?;
    if !path.exists() {
        return Ok(Prefs {
            locale: default_locale(),
            last_export_dir: None,
            summary_model: default_summary_model(),
        });
    }
    let raw = std::fs::read_to_string(&path)?;
    let prefs: Prefs = serde_json::from_str(&raw).unwrap_or_default();
    Ok(prefs)
}

fn write_prefs(prefs: &Prefs) -> AppResult<()> {
    let path = prefs_path()?;
    let raw = serde_json::to_string_pretty(prefs)?;
    std::fs::write(&path, raw)?;
    Ok(())
}

fn keyring_get(account: &str) -> AppResult<Option<String>> {
    let entry = Entry::new(SERVICE, account)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

fn keyring_set(account: &str, value: &str) -> AppResult<()> {
    let entry = Entry::new(SERVICE, account)?;
    entry.set_password(value)?;
    Ok(())
}

fn keyring_delete(account: &str) -> AppResult<()> {
    let entry = Entry::new(SERVICE, account)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

#[tauri::command]
pub fn get_settings() -> AppResult<SettingsView> {
    let prefs = read_prefs()?;
    let soniox_key_set = keyring_get(ACCOUNT_SONIOX)?
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    let openai_key_set = keyring_get(ACCOUNT_OPENAI)?
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    Ok(SettingsView {
        soniox_key_set,
        openai_key_set,
        prefs,
    })
}

#[tauri::command]
pub fn get_soniox_key() -> AppResult<Option<String>> {
    keyring_get(ACCOUNT_SONIOX)
}

#[tauri::command]
pub fn get_openai_key() -> AppResult<Option<String>> {
    keyring_get(ACCOUNT_OPENAI)
}

#[tauri::command]
pub fn set_soniox_key(value: String) -> AppResult<()> {
    let v = value.trim();
    if v.is_empty() {
        return keyring_delete(ACCOUNT_SONIOX);
    }
    keyring_set(ACCOUNT_SONIOX, v)
}

#[tauri::command]
pub fn set_openai_key(value: String) -> AppResult<()> {
    let v = value.trim();
    if v.is_empty() {
        return keyring_delete(ACCOUNT_OPENAI);
    }
    keyring_set(ACCOUNT_OPENAI, v)
}

#[tauri::command]
pub fn clear_soniox_key() -> AppResult<()> {
    keyring_delete(ACCOUNT_SONIOX)
}

#[tauri::command]
pub fn clear_openai_key() -> AppResult<()> {
    keyring_delete(ACCOUNT_OPENAI)
}

#[tauri::command]
pub fn get_prefs() -> AppResult<Prefs> {
    read_prefs()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub locale: Option<String>,
    pub last_export_dir: Option<String>,
    pub summary_model: Option<String>,
}

#[tauri::command]
pub fn set_prefs(patch: PrefsPatch) -> AppResult<Prefs> {
    let mut prefs = read_prefs()?;
    if let Some(v) = patch.locale {
        prefs.locale = v;
    }
    if let Some(v) = patch.last_export_dir {
        prefs.last_export_dir = Some(v);
    }
    if let Some(v) = patch.summary_model {
        prefs.summary_model = v;
    }
    write_prefs(&prefs)?;
    Ok(prefs)
}
