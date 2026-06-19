pub mod autokey;

use launcher_backup::{
    read_bundle, write_bundle, BackupManifest, BackupType, BundleKey, ExportFile, ExportOptions,
    ImportMode, ModuleImport, ModuleManifest,
};
use serde::{Deserialize, Serialize};

const MODULES_WITH_DATA: &[&str] = &["myssh", "open-sesame", "comtor"];

fn export_module(id: &str, opts: ExportOptions) -> Result<launcher_backup::ModuleExport, String> {
    let r = match id {
        "myssh" => tauri_plugin_myssh::backup::export_data(opts),
        "open-sesame" => tauri_plugin_open_sesame::backup::export_data(opts),
        "comtor" => tauri_plugin_comtor::backup::export_data(opts),
        _ => return Err(format!("module {id} has no exportable data")),
    };
    r.map_err(|e| format!("{id}: {e}"))
}

fn import_module(id: &str, input: ModuleImport) -> Result<(), String> {
    let r = match id {
        "myssh" => tauri_plugin_myssh::backup::import_data(input, ImportMode::Replace),
        "open-sesame" => tauri_plugin_open_sesame::backup::import_data(input, ImportMode::Replace),
        "comtor" => tauri_plugin_comtor::backup::import_data(input, ImportMode::Replace),
        _ => return Err(format!("module {id} cannot import")),
    };
    r.map_err(|e| format!("{id}: {e}"))
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModulePlan {
    pub id: String,
    pub label: String,
    pub heavy_label: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleSel {
    pub id: String,
    pub include_heavy: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReq {
    pub selection: Vec<ModuleSel>,
    pub appearance: serde_json::Value,
    pub passphrase: String,
    pub dest_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReq {
    pub src_path: String,
    pub passphrase: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOut {
    pub version: u32,
    pub app_version: String,
    pub created_at_ms: u64,
    pub modules: Vec<PreviewModule>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewModule {
    pub id: String,
    pub include_heavy: bool,
    pub file_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReq {
    pub src_path: String,
    pub passphrase: String,
    pub selection: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleResult {
    pub id: String,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOut {
    pub results: Vec<ModuleResult>,
    pub appearance: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_src(src: &str, pass: &str) -> Result<launcher_backup::ReadBundle, String> {
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    read_bundle(&bytes, BundleKey::Passphrase(pass)).map_err(|e| e.to_string())
}

fn auto_backup_module(id: &str) -> Result<(), String> {
    let me = export_module(id, ExportOptions { include_heavy: true })?;
    let mut files = Vec::new();
    for f in me.files {
        files.push(ExportFile {
            rel_path: format!("{id}/{}", f.rel_path),
            bytes: f.bytes,
        });
    }
    if !me.secrets.is_empty() {
        let json = serde_json::to_vec(
            &me.secrets
                .iter()
                .map(|s| (s.account.clone(), s.value.clone()))
                .collect::<std::collections::BTreeMap<_, _>>(),
        )
        .map_err(|e| e.to_string())?;
        files.push(ExportFile {
            rel_path: format!("{id}/secrets.json"),
            bytes: json,
        });
    }
    let manifest = BackupManifest {
        version: 1,
        created_at_ms: now_ms(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backup_type: BackupType::Auto,
        modules: vec![ModuleManifest {
            id: id.into(),
            include_heavy: true,
            file_count: files.len(),
        }],
    };
    let key = autokey::get_or_create_autokey().map_err(|e| e.to_string())?;
    let bytes =
        write_bundle(&manifest, &files, BundleKey::Raw(&key)).map_err(|e| e.to_string())?;
    let dir = launcher_paths::launcher_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("auto-{id}-{}.dlbak", now_ms()));
    std::fs::write(path, &bytes).map_err(|e| e.to_string())?;
    prune_auto_backups(&dir, id, 3);
    Ok(())
}

fn prune_auto_backups(dir: &std::path::Path, id: &str, keep: usize) {
    let prefix = format!("auto-{id}-");
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().starts_with(&prefix))
                .unwrap_or(false)
        })
        .collect();
    entries.sort();
    while entries.len() > keep {
        let old = entries.remove(0);
        let _ = std::fs::remove_file(old);
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn backup_plan() -> Vec<ModulePlan> {
    vec![
        ModulePlan {
            id: "myssh".into(),
            label: "MySSH".into(),
            heavy_label: Some("SSH key files".into()),
        },
        ModulePlan {
            id: "open-sesame".into(),
            label: "Open Sesame".into(),
            heavy_label: Some("Mirror folders".into()),
        },
        ModulePlan {
            id: "comtor".into(),
            label: "Virtual Comtor".into(),
            heavy_label: Some("Audio recordings".into()),
        },
        ModulePlan {
            id: "video-downloader".into(),
            label: "Media Toolbox".into(),
            heavy_label: None,
        },
        ModulePlan {
            id: "md-converter".into(),
            label: "Markdown Converter".into(),
            heavy_label: None,
        },
    ]
}

#[tauri::command]
pub fn backup_export(req: ExportReq) -> Result<String, String> {
    if req.passphrase.trim().is_empty() {
        return Err("Passphrase is required".into());
    }
    let mut files: Vec<ExportFile> = Vec::new();
    let mut modules: Vec<ModuleManifest> = Vec::new();

    // Appearance (always included)
    let appearance_bytes =
        serde_json::to_vec(&req.appearance).map_err(|e| e.to_string())?;
    files.push(ExportFile {
        rel_path: "launcher/appearance.json".into(),
        bytes: appearance_bytes,
    });

    for sel in &req.selection {
        if !MODULES_WITH_DATA.contains(&sel.id.as_str()) {
            continue;
        }
        let me = export_module(&sel.id, ExportOptions { include_heavy: sel.include_heavy })?;
        let mut count = 0usize;
        for f in me.files {
            files.push(ExportFile {
                rel_path: format!("{}/{}", sel.id, f.rel_path),
                bytes: f.bytes,
            });
            count += 1;
        }
        if !me.secrets.is_empty() {
            let json = serde_json::to_vec(
                &me.secrets
                    .iter()
                    .map(|s| (s.account.clone(), s.value.clone()))
                    .collect::<std::collections::BTreeMap<_, _>>(),
            )
            .map_err(|e| e.to_string())?;
            files.push(ExportFile {
                rel_path: format!("{}/secrets.json", sel.id),
                bytes: json,
            });
            count += 1;
        }
        modules.push(ModuleManifest {
            id: sel.id.clone(),
            include_heavy: sel.include_heavy,
            file_count: count,
        });
    }

    let manifest = BackupManifest {
        version: 1,
        created_at_ms: now_ms(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backup_type: BackupType::Full,
        modules,
    };
    let bytes = write_bundle(&manifest, &files, BundleKey::Passphrase(&req.passphrase))
        .map_err(|e| e.to_string())?;
    std::fs::write(&req.dest_path, &bytes).map_err(|e| e.to_string())?;
    Ok(req.dest_path)
}

#[tauri::command]
pub fn backup_preview(req: PreviewReq) -> Result<PreviewOut, String> {
    let rb = read_src(&req.src_path, &req.passphrase)?;
    Ok(PreviewOut {
        version: rb.manifest.version,
        app_version: rb.manifest.app_version,
        created_at_ms: rb.manifest.created_at_ms,
        modules: rb
            .manifest
            .modules
            .into_iter()
            .map(|m| PreviewModule {
                id: m.id,
                include_heavy: m.include_heavy,
                file_count: m.file_count,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn backup_import_apply(
    app: tauri::AppHandle,
    req: ApplyReq,
) -> Result<ApplyOut, String> {
    use tauri::Manager;
    let rb = read_src(&req.src_path, &req.passphrase)?;

    // Appearance for the frontend to apply.
    let appearance = rb
        .files
        .iter()
        .find(|f| f.rel_path == "launcher/appearance.json")
        .and_then(|f| serde_json::from_slice(&f.bytes).ok())
        .unwrap_or(serde_json::Value::Null);

    let mut results = Vec::new();
    'modules: for id in &req.selection {
        // Close the module window to release DB locks.
        if let Some(w) = app.get_webview_window(id) {
            let _ = w.close();
        }
        // Auto-backup the current data first.
        if let Err(e) = auto_backup_module(id) {
            results.push(ModuleResult {
                id: id.clone(),
                ok: false,
                error: Some(format!("auto-backup failed: {e}")),
            });
            continue;
        }
        // Assemble this module's ModuleImport from the bundle subtree.
        let prefix = format!("{id}/");
        let mut mi = ModuleImport::default();
        for f in rb.files.iter().filter(|f| f.rel_path.starts_with(&prefix)) {
            let rel = f.rel_path.strip_prefix(&prefix).unwrap_or(&f.rel_path);
            if rel == "secrets.json" {
                match serde_json::from_slice::<std::collections::BTreeMap<String, String>>(
                    &f.bytes,
                ) {
                    Ok(map) => {
                        for (account, value) in map {
                            mi.secrets
                                .push(launcher_backup::SecretEntry { account, value });
                        }
                    }
                    Err(e) => {
                        results.push(ModuleResult {
                            id: id.clone(),
                            ok: false,
                            error: Some(format!("secrets.json parse error: {e}")),
                        });
                        continue 'modules;
                    }
                }
            } else {
                mi.files.push(ExportFile {
                    rel_path: rel.to_string(),
                    bytes: f.bytes.clone(),
                });
            }
        }
        match import_module(id, mi) {
            Ok(()) => results.push(ModuleResult {
                id: id.clone(),
                ok: true,
                error: None,
            }),
            Err(e) => results.push(ModuleResult {
                id: id.clone(),
                ok: false,
                error: Some(e),
            }),
        }
    }
    Ok(ApplyOut { results, appearance })
}
