use super::*;
use crate::models::account::ProviderType;
use crate::models::doc_set::{DocSet, DocSetStatus, Strategy};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn make_doc_set(mirror_path: &Path, source_path: &Path) -> DocSet {
    let now = chrono::Utc::now();
    DocSet {
        id: "ds1".into(),
        workspace_id: "ws1".into(),
        account_id: "acc1".into(),
        display_name: "Docs".into(),
        source_path: source_path.to_string_lossy().into(),
        strategy: Strategy::Mirrored,
        mirror_path: Some(mirror_path.to_string_lossy().into()),
        provider_type: ProviderType::Github,
        remote_url: None,
        remote_id: None,
        branch: "main".into(),
        auto_sync: false,
        last_synced_at: None,
        last_commit: None,
        status: DocSetStatus::Idle,
        has_mapping: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
    }
}

#[test]
fn test_write_manifest_creates_marker_and_mapping_without_worktree_gitignore() {
    let tmp = TempDir::new().unwrap();
    let source = tmp.path().join("source");
    let mirror = tmp.path().join("mirror");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&mirror).unwrap();
    let doc_set = make_doc_set(&mirror, &source);

    write_manifest(&doc_set).unwrap();

    assert!(mirror.join(".open-sesame/doc-set.json").exists());
    assert!(mirror.join(".open-sesame/device.local.json").exists());
    assert!(!mirror.join(".gitignore").exists());
}

#[test]
fn test_add_source_updates_manifest_and_mapping() {
    let tmp = TempDir::new().unwrap();
    let source = tmp.path().join("source");
    let extra = tmp.path().join("extra");
    let mirror = tmp.path().join("mirror");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&extra).unwrap();
    fs::write(extra.join("note.md"), "hello").unwrap();
    fs::create_dir_all(&mirror).unwrap();
    let doc_set = make_doc_set(&mirror, &source);
    write_manifest(&doc_set).unwrap();

    add_source(
        &doc_set,
        AddSourceInput {
            doc_set_id: "ds1".into(),
            source_path: extra.to_string_lossy().into(),
            alias: "Extra Notes".into(),
        },
    )
    .unwrap();

    let overview = mapping_overview(&doc_set).unwrap();
    assert!(overview
        .manifest
        .sources
        .iter()
        .any(|source| source.id == "extra-notes"));
    assert!(mirror.join("extra-notes/note.md").exists());
}

#[test]
fn test_remove_new_mirror_path_removes_untracked_source() {
    let test_root = std::env::current_dir().unwrap().join("target/test-temp");
    fs::create_dir_all(&test_root).unwrap();
    let tmp = TempDir::new_in(test_root).unwrap();
    let source = tmp.path().join("source");
    let extra = tmp.path().join("extra");
    let mirror = tmp.path().join("mirror");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&extra).unwrap();
    fs::write(extra.join("note.md"), "hello").unwrap();
    fs::create_dir_all(&mirror).unwrap();
    git2::Repository::init(&mirror).unwrap();
    let doc_set = make_doc_set(&mirror, &source);
    write_manifest(&doc_set).unwrap();
    add_source(
        &doc_set,
        AddSourceInput {
            doc_set_id: "ds1".into(),
            source_path: extra.to_string_lossy().into(),
            alias: "Extra Notes".into(),
        },
    )
    .unwrap();

    let overview = remove_new_mirror_path(
        &doc_set,
        RemoveMirrorPathInput {
            doc_set_id: "ds1".into(),
            mirror_path: "extra-notes".into(),
        },
    )
    .unwrap();

    assert!(!mirror.join("extra-notes").exists());
    assert!(!overview
        .manifest
        .sources
        .iter()
        .any(|source| source.id == "extra-notes"));
}

#[test]
fn test_copy_mirror_to_local_skips_missing_mirror_source() {
    let tmp = TempDir::new().unwrap();
    let source = tmp.path().join("source");
    let mirror = tmp.path().join("mirror");
    let local_child = tmp.path().join("local-child");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(mirror.join("child")).unwrap();
    fs::write(mirror.join("child/note.md"), "hello").unwrap();
    fs::create_dir_all(&local_child).unwrap();
    fs::write(local_child.join("note.md"), "hello").unwrap();
    let doc_set = make_doc_set(&mirror, &source);
    write_manifest(&doc_set).unwrap();
    add_mirror_source(
        &doc_set,
        AddMirrorSourceInput {
            doc_set_id: "ds1".into(),
            mirror_path: "child".into(),
            alias: Some("Child".into()),
        },
    )
    .unwrap();
    let overview = mapping_overview(&doc_set).unwrap();
    let child = overview
        .sources
        .iter()
        .find(|source| source.source.mirror_path == "child")
        .unwrap();
    set_source_mapping(
        &doc_set,
        SetSourceMappingInput {
            doc_set_id: "ds1".into(),
            source_id: child.source.id.clone(),
            local_path: Some(local_child.to_string_lossy().into()),
            enabled: true,
            direction: SyncDirection::TwoWay,
        },
    )
    .unwrap();

    fs::remove_dir_all(mirror.join("child")).unwrap();
    let removed = copy_enabled_mirror_to_local(&doc_set).unwrap();

    // An entirely-absent mirror source is treated as drift, not a deliberate
    // delete: the mapped local folder is preserved (symmetric with the push
    // side, which skips a missing local source).
    assert_eq!(removed, 0);
    assert!(local_child.exists());
    assert!(local_child.join("note.md").exists());
}

#[test]
fn test_mapping_preflight_detects_empty_and_conflicts() {
    let tmp = TempDir::new().unwrap();
    let source = tmp.path().join("source");
    let mirror = tmp.path().join("mirror");
    let local = tmp.path().join("local");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&mirror).unwrap();
    fs::create_dir_all(&local).unwrap();
    fs::write(mirror.join("same.md"), "same").unwrap();
    fs::write(mirror.join("conflict.md"), "mirror").unwrap();
    fs::write(local.join("same.md"), "same").unwrap();
    fs::write(local.join("conflict.md"), "local").unwrap();
    fs::write(local.join("local-only.md"), "local only").unwrap();
    let doc_set = make_doc_set(&mirror, &source);
    write_manifest(&doc_set).unwrap();

    let preflight = mapping_preflight(
        &doc_set,
        MappingPreflightInput {
            doc_set_id: "ds1".into(),
            mirror_path: ".".into(),
            local_path: local.to_string_lossy().into(),
        },
    )
    .unwrap();

    assert_eq!(preflight.status, "has_conflicts");
    assert_eq!(preflight.same, 1);
    assert_eq!(preflight.only_local, 1);
    assert_eq!(preflight.conflicts, 1);

    let empty = tmp.path().join("empty");
    fs::create_dir_all(&empty).unwrap();
    let preflight = mapping_preflight(
        &doc_set,
        MappingPreflightInput {
            doc_set_id: "ds1".into(),
            mirror_path: ".".into(),
            local_path: empty.to_string_lossy().into(),
        },
    )
    .unwrap();

    assert_eq!(preflight.status, "empty");
    assert!(preflight.local_is_empty);
}

#[test]
fn test_preserve_local_changes_keeps_conflict_copy() {
    let tmp = TempDir::new().unwrap();
    let source = tmp.path().join("source");
    let mirror = tmp.path().join("mirror");
    let local = tmp.path().join("local");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&mirror).unwrap();
    fs::create_dir_all(&local).unwrap();
    fs::write(mirror.join("conflict.md"), "mirror").unwrap();
    fs::write(local.join("conflict.md"), "local").unwrap();
    fs::write(local.join("local-only.md"), "local only").unwrap();
    let doc_set = make_doc_set(&mirror, &source);
    write_manifest(&doc_set).unwrap();

    let copied = preserve_local_changes_in_mirror(
        &doc_set,
        MappingPreflightInput {
            doc_set_id: "ds1".into(),
            mirror_path: ".".into(),
            local_path: local.to_string_lossy().into(),
        },
    )
    .unwrap();

    assert_eq!(copied, 2);
    assert_eq!(
        fs::read_to_string(mirror.join("conflict.md")).unwrap(),
        "mirror"
    );
    assert_eq!(
        fs::read_to_string(mirror.join("conflict.local-copy.md")).unwrap(),
        "local"
    );
    assert_eq!(
        fs::read_to_string(mirror.join("local-only.md")).unwrap(),
        "local only"
    );
}
