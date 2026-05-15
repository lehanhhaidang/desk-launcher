use crate::error::AppResult;
use crate::models::doc_set::{
    CreateDocSetInput, DocSet, DocSetStatus, ImportGithubDocSetInput, SetupGithubRemoteInput,
    Strategy,
};
use crate::services::{
    doc_set_manifest_service, doc_set_service, github_import_service, github_sync_setup_service,
    strategy_detector,
};
use crate::state::AppState;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
pub struct DetectionResponse {
    pub strategy: String,
    pub parent_repo_path: Option<String>,
    pub reason: String,
}

#[derive(Clone, Serialize)]
pub struct FileChangeEvent {
    pub doc_set_id: String,
    pub origin: String,
    pub changed_files: Vec<String>,
}

#[tauri::command]
pub async fn doc_set_detect_strategy(source_path: String) -> AppResult<DetectionResponse> {
    let path = std::path::Path::new(&source_path);
    let result = strategy_detector::detect(path)?;
    Ok(DetectionResponse {
        strategy: match result.strategy {
            Strategy::Standalone => "standalone".into(),
            Strategy::Mirrored => "mirrored".into(),
        },
        parent_repo_path: result.parent_repo_path,
        reason: result.reason,
    })
}

#[tauri::command]
pub async fn doc_set_create(
    state: tauri::State<'_, AppState>,
    input: CreateDocSetInput,
) -> AppResult<DocSet> {
    let db = state.db.lock().await;
    doc_set_service::create(&db, input)
}

#[tauri::command]
pub async fn doc_set_list(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<DocSet>> {
    let db = state.db.lock().await;
    doc_set_service::list_by_workspace(&db, &workspace_id)
}

#[tauri::command]
pub async fn doc_set_list_all(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<DocSet>> {
    let db = state.db.lock().await;
    let all = crate::db::doc_set_repo::list_all(&db)?;
    Ok(all)
}

#[tauri::command]
pub async fn doc_set_delete(state: tauri::State<'_, AppState>, id: String) -> AppResult<()> {
    let db = state.db.lock().await;
    doc_set_service::delete(&db, &id)
}

#[tauri::command]
pub async fn doc_set_move(
    state: tauri::State<'_, AppState>,
    id: String,
    workspace_id: String,
) -> AppResult<DocSet> {
    let db = state.db.lock().await;
    doc_set_service::move_to_workspace(&db, &id, &workspace_id)
}

#[tauri::command]
pub async fn doc_set_set_auto_sync(
    state: tauri::State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<DocSet> {
    let db = state.db.lock().await;
    crate::db::doc_set_repo::update_auto_sync(&db, &id, enabled)?;
    doc_set_service::get_by_id(&db, &id)
}

#[tauri::command]
pub async fn doc_set_setup_github_remote(
    state: tauri::State<'_, AppState>,
    input: SetupGithubRemoteInput,
) -> AppResult<DocSet> {
    github_sync_setup_service::setup_github_remote(state.db.clone(), input).await
}

#[tauri::command]
pub async fn doc_set_import_from_github(
    state: tauri::State<'_, AppState>,
    input: ImportGithubDocSetInput,
) -> AppResult<DocSet> {
    github_import_service::import_from_github(state.db.clone(), input).await
}

#[tauri::command]
pub async fn doc_set_sources(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<doc_set_manifest_service::MappingOverview> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &doc_set_id)?;
    let overview = doc_set_manifest_service::mapping_overview(&doc_set)?;
    clear_error_status(&db, &doc_set)?;
    Ok(overview)
}

#[tauri::command]
pub async fn doc_set_mapping_preflight(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::MappingPreflightInput,
) -> AppResult<doc_set_manifest_service::MappingPreflight> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    doc_set_manifest_service::mapping_preflight(&doc_set, input)
}

#[tauri::command]
pub async fn doc_set_set_source_mapping(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::SetSourceMappingInput,
) -> AppResult<doc_set_manifest_service::MappingOverview> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    let overview = doc_set_manifest_service::set_source_mapping(&doc_set, input)?;
    clear_error_status(&db, &doc_set)?;

    // Mark has_mapping if any source has an enabled mapping with a local path
    let any_mapped = overview.sources.iter().any(|s| s.mapping.enabled && s.mapping.local_path.is_some());
    if any_mapped && !doc_set.has_mapping {
        crate::db::doc_set_repo::update_has_mapping(&db, &doc_set.id, true)?;
    }

    Ok(overview)
}

#[tauri::command]
pub async fn doc_set_add_source(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::AddSourceInput,
) -> AppResult<doc_set_manifest_service::MappingOverview> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    let overview = doc_set_manifest_service::add_source(&doc_set, input)?;
    clear_error_status(&db, &doc_set)?;
    Ok(overview)
}

#[tauri::command]
pub async fn doc_set_add_mirror_source(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::AddMirrorSourceInput,
) -> AppResult<doc_set_manifest_service::MappingOverview> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    let overview = doc_set_manifest_service::add_mirror_source(&doc_set, input)?;
    clear_error_status(&db, &doc_set)?;
    Ok(overview)
}

#[tauri::command]
pub async fn doc_set_remove_new_mirror_path(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::RemoveMirrorPathInput,
) -> AppResult<doc_set_manifest_service::MappingOverview> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    let overview = doc_set_manifest_service::remove_new_mirror_path(&doc_set, input)?;
    clear_error_status(&db, &doc_set)?;
    Ok(overview)
}

#[tauri::command]
pub async fn doc_set_refresh_mirror(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<usize> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &doc_set_id)?;
    let count = doc_set_manifest_service::copy_enabled_local_to_mirror(&doc_set)?;
    clear_error_status(&db, &doc_set)?;
    Ok(count)
}

#[tauri::command]
pub async fn doc_set_restore_local_from_mirror(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<usize> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &doc_set_id)?;
    let count = doc_set_manifest_service::copy_enabled_mirror_to_local(&doc_set)?;
    clear_error_status(&db, &doc_set)?;
    Ok(count)
}

#[tauri::command]
pub async fn doc_set_keep_both_local_changes(
    state: tauri::State<'_, AppState>,
    input: doc_set_manifest_service::MappingPreflightInput,
) -> AppResult<usize> {
    let db = state.db.lock().await;
    let doc_set = doc_set_service::get_by_id(&db, &input.doc_set_id)?;
    let count = doc_set_manifest_service::preserve_local_changes_in_mirror(&doc_set, input)?;
    clear_error_status(&db, &doc_set)?;
    Ok(count)
}

#[tauri::command]
pub async fn doc_set_watch_start(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<()> {
    let (doc_set, local_paths) = {
        let db = state.db.lock().await;
        let doc_set = doc_set_service::get_by_id(&db, &doc_set_id)?;
        let overview = doc_set_manifest_service::mapping_overview(&doc_set)?;
        let local_paths = overview
            .sources
            .iter()
            .filter(|source| source.mapping.enabled)
            .filter(|source| !matches!(source.mapping.direction, doc_set_manifest_service::SyncDirection::MirrorOnly))
            .filter_map(|source| source.mapping.local_path.as_ref())
            .map(PathBuf::from)
            .collect::<Vec<_>>();
        (doc_set, local_paths)
    };

    let Some(mirror_path) = doc_set.mirror_path.as_ref().map(PathBuf::from) else {
        return Ok(());
    };

    let mut watcher = build_doc_set_watcher(app_handle, doc_set_id.clone(), mirror_path.clone(), local_paths.clone())?;
    if mirror_path.exists() {
        watcher
            .watch(&mirror_path, RecursiveMode::Recursive)
            .map_err(|err| crate::error::AppError::Internal(format!("Failed to watch mirror: {err}")))?;
    }
    for path in local_paths {
        let watch_path = watchable_path(&path);
        if watch_path.exists() {
            watcher
                .watch(&watch_path, RecursiveMode::Recursive)
                .map_err(|err| crate::error::AppError::Internal(format!("Failed to watch local path: {err}")))?;
        }
    }

    let mut watchers = state.watchers.lock().await;
    watchers.insert(doc_set_id, watcher);
    Ok(())
}

#[tauri::command]
pub async fn doc_set_watch_stop(
    state: tauri::State<'_, AppState>,
    doc_set_id: String,
) -> AppResult<()> {
    let mut watchers = state.watchers.lock().await;
    watchers.remove(&doc_set_id);
    Ok(())
}

fn clear_error_status(db: &rusqlite::Connection, doc_set: &DocSet) -> AppResult<()> {
    if doc_set.status == DocSetStatus::Error {
        crate::db::doc_set_repo::update_status(db, &doc_set.id, &DocSetStatus::Idle)?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ExportConfig {
    pub version: u32,
    pub exported_at: String,
    pub workspaces: Vec<ExportWorkspace>,
}

#[derive(Serialize)]
pub struct ExportWorkspace {
    pub name: String,
    pub icon: Option<String>,
    pub doc_sets: Vec<ExportDocSet>,
}

#[derive(Serialize)]
pub struct ExportDocSet {
    pub display_name: String,
    pub provider_type: String,
    pub remote_url: Option<String>,
    pub branch: String,
    pub strategy: String,
}

#[tauri::command]
pub async fn config_export(
    state: tauri::State<'_, AppState>,
    workspace_ids: Vec<String>,
) -> AppResult<ExportConfig> {
    let db = state.db.lock().await;
    let mut workspaces = Vec::new();

    for ws_id in &workspace_ids {
        let ws = crate::db::workspace_repo::find_by_id(&db, ws_id)?
            .ok_or_else(|| crate::error::AppError::NotFound("Workspace".into()))?;

        let doc_sets = crate::db::doc_set_repo::list_by_workspace(&db, ws_id)?;
        let exported_doc_sets: Vec<ExportDocSet> = doc_sets
            .iter()
            .map(|ds| ExportDocSet {
                display_name: ds.display_name.clone(),
                provider_type: ds.provider_type.as_str().into(),
                remote_url: ds.remote_url.clone(),
                branch: ds.branch.clone(),
                strategy: serde_json::to_string(&ds.strategy)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .into(),
            })
            .collect();

        workspaces.push(ExportWorkspace {
            name: ws.name,
            icon: ws.icon,
            doc_sets: exported_doc_sets,
        });
    }

    Ok(ExportConfig {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        workspaces,
    })
}

#[derive(serde::Deserialize)]
pub struct ImportConfig {
    pub workspaces: Vec<ImportWorkspace>,
}

#[derive(serde::Deserialize)]
pub struct ImportWorkspace {
    pub name: String,
    pub icon: Option<String>,
    pub doc_sets: Vec<ImportDocSet>,
}

#[derive(serde::Deserialize)]
pub struct ImportDocSet {
    pub display_name: String,
    pub provider_type: Option<String>,
    pub remote_url: Option<String>,
    pub branch: Option<String>,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub workspaces_created: usize,
    pub doc_sets_created: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn config_import(
    state: tauri::State<'_, AppState>,
    config: ImportConfig,
    account_id: String,
) -> AppResult<ImportResult> {
    let mut ws_created = 0;
    let mut ds_created = 0;
    let mut errors = Vec::new();

    for ws_input in config.workspaces {
        // Create workspace
        let ws_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let ws = crate::models::workspace::Workspace {
            id: ws_id.clone(),
            name: ws_input.name.clone(),
            icon: ws_input.icon,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        };

        {
            let db = state.db.lock().await;
            if let Err(err) = crate::db::workspace_repo::insert(&db, &ws) {
                errors.push(format!("Failed to create workspace '{}': {}", ws_input.name, err));
                continue;
            }
        }
        ws_created += 1;

        // Import doc sets
        for ds_input in ws_input.doc_sets {
            if let Some(remote_url) = &ds_input.remote_url {
                let import_input = ImportGithubDocSetInput {
                    workspace_id: ws_id.clone(),
                    account_id: account_id.clone(),
                    remote_url: remote_url.clone(),
                    display_name: Some(ds_input.display_name.clone()),
                };
                match github_import_service::import_from_github(state.db.clone(), import_input).await {
                    Ok(_) => ds_created += 1,
                    Err(err) => errors.push(format!("Failed to import '{}': {}", ds_input.display_name, err)),
                }
            } else {
                errors.push(format!("Skipped '{}': no remote_url", ds_input.display_name));
            }
        }
    }

    Ok(ImportResult {
        workspaces_created: ws_created,
        doc_sets_created: ds_created,
        errors,
    })
}

fn build_doc_set_watcher(
    app_handle: AppHandle,
    doc_set_id: String,
    mirror_path: PathBuf,
    local_paths: Vec<PathBuf>,
) -> AppResult<RecommendedWatcher> {
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| {
            let Ok(event) = result else {
                return;
            };
            if !is_interesting_event(&event.kind) {
                return;
            }

            let changed_files = event
                .paths
                .iter()
                .filter(|path| !is_internal_path(path))
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>();
            if changed_files.is_empty() {
                return;
            }

            let now = Instant::now();
            if now.duration_since(last_emit) < Duration::from_millis(450) {
                return;
            }
            last_emit = now;

            let origin = if event.paths.iter().any(|path| path.starts_with(&mirror_path)) {
                "mirror"
            } else if event
                .paths
                .iter()
                .any(|path| local_paths.iter().any(|local| path.starts_with(local) || local.starts_with(path)))
            {
                "local"
            } else {
                "unknown"
            };

            let _ = app_handle.emit(
                "fs:change",
                FileChangeEvent {
                    doc_set_id: doc_set_id.clone(),
                    origin: origin.into(),
                    changed_files,
                },
            );
        },
        Config::default(),
    )
    .map_err(|err| crate::error::AppError::Internal(format!("Failed to create watcher: {err}")))?;
    Ok(watcher)
}

fn watchable_path(path: &Path) -> PathBuf {
    if path.is_file() {
        path.parent().map(Path::to_path_buf).unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    }
}

fn is_interesting_event(kind: &notify::EventKind) -> bool {
    matches!(
        kind,
        notify::EventKind::Create(_)
            | notify::EventKind::Modify(_)
            | notify::EventKind::Remove(_)
            | notify::EventKind::Any
    )
}

fn is_internal_path(path: &Path) -> bool {
    path.components().any(|component| {
        let value = component.as_os_str().to_string_lossy();
        value == ".git" || value == ".open-sesame"
    })
}
