use crate::types::{BackupError, ExportFile};
use std::io::{Cursor, Read};

pub fn pack(files: &[ExportFile]) -> Result<Vec<u8>, BackupError> {
    let mut builder = tar::Builder::new(Vec::new());
    for f in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(f.bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, &f.rel_path, Cursor::new(&f.bytes))
            .map_err(|e| BackupError::Archive(format!("append {}: {e}", f.rel_path)))?;
    }
    builder.into_inner().map_err(|e| BackupError::Archive(e.to_string()))
}

pub fn unpack(bytes: &[u8]) -> Result<Vec<ExportFile>, BackupError> {
    let mut archive = tar::Archive::new(Cursor::new(bytes));
    let mut out = Vec::new();
    for entry in archive.entries().map_err(|e| BackupError::Archive(e.to_string()))? {
        let mut entry = entry.map_err(|e| BackupError::Archive(e.to_string()))?;
        let path = entry
            .path()
            .map_err(|e| BackupError::Archive(e.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| BackupError::Archive(e.to_string()))?;
        out.push(ExportFile { rel_path: path, bytes: buf });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ExportFile;

    #[test]
    fn pack_unpack_round_trips() {
        let files = vec![
            ExportFile { rel_path: "manifest.json".into(), bytes: b"{}".to_vec() },
            ExportFile { rel_path: "myssh/db.sqlite".into(), bytes: vec![0, 1, 2, 3] },
        ];
        let packed = pack(&files).unwrap();
        let mut out = unpack(&packed).unwrap();
        out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].rel_path, "manifest.json");
        assert_eq!(out[1].bytes, vec![0, 1, 2, 3]);
    }
}
