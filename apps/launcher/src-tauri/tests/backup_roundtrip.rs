use launcher_backup::*;

#[test]
fn export_assemble_then_reassemble() {
    let files = vec![
        ExportFile { rel_path: "myssh/db.sqlite".into(), bytes: vec![1, 2, 3] },
        ExportFile { rel_path: "myssh/secrets.json".into(), bytes: br#"{"host-1":"pw"}"#.to_vec() },
        ExportFile { rel_path: "launcher/appearance.json".into(), bytes: br#"{"theme:launcher":"{}"}"#.to_vec() },
    ];
    let manifest = BackupManifest {
        version: 1, created_at_ms: 1, app_version: "test".into(),
        backup_type: BackupType::Full,
        modules: vec![ModuleManifest { id: "myssh".into(), include_heavy: false, file_count: 2 }],
    };
    let bytes = write_bundle(&manifest, &files, BundleKey::Passphrase("pw")).unwrap();
    let rb = read_bundle(&bytes, BundleKey::Passphrase("pw")).unwrap();
    let secrets = rb.files.iter().find(|f| f.rel_path == "myssh/secrets.json").unwrap();
    let map: std::collections::BTreeMap<String, String> = serde_json::from_slice(&secrets.bytes).unwrap();
    assert_eq!(map.get("host-1").unwrap(), "pw");
    assert!(rb.files.iter().any(|f| f.rel_path == "launcher/appearance.json"));
}
