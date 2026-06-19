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
        let rel_path = entry
            .path()
            .map_err(|e| BackupError::Archive(e.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");

        // Reject any path that could escape the target directory.
        if rel_path.starts_with('/') || rel_path.starts_with("\\\\") || rel_path.contains(':') {
            return Err(BackupError::Archive(format!("unsafe path in archive: {rel_path}")));
        }
        for component in rel_path.split('/') {
            if component == ".." {
                return Err(BackupError::Archive(format!("unsafe path in archive: {rel_path}")));
            }
        }

        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| BackupError::Archive(e.to_string()))?;
        out.push(ExportFile { rel_path, bytes: buf });
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

    #[test]
    fn unpack_rejects_path_traversal() {
        // The `tar` crate validates paths on `append_data`, so we must build a
        // raw tar byte stream by hand to smuggle in a `../evil.txt` entry.
        // A POSIX ustar tar entry is a 512-byte header block followed by
        // zero or more 512-byte data blocks, then two zero blocks at the end.
        let filename = b"../evil.txt";
        let payload = b"evil";

        let mut header = [0u8; 512];
        // name field: bytes 0-99
        header[..filename.len()].copy_from_slice(filename);
        // mode: bytes 100-107
        header[100..108].copy_from_slice(b"0000644\0");
        // uid: 108-115
        header[108..116].copy_from_slice(b"0000000\0");
        // gid: 116-123
        header[116..124].copy_from_slice(b"0000000\0");
        // size: 124-135 (octal, 4 bytes, null-terminated)
        header[124..135].copy_from_slice(b"00000000004");
        header[135] = b'\0';
        // mtime: 136-147
        header[136..147].copy_from_slice(b"00000000000");
        header[147] = b'\0';
        // type flag: 148 is checksum; 156 = '0' (regular file)
        header[156] = b'0';
        // magic: 257-262 (ustar)
        header[257..263].copy_from_slice(b"ustar ");
        header[263] = b' ';
        header[264] = b'\0';

        // compute and write checksum (bytes 148-155, fill with spaces first)
        header[148..156].fill(b' ');
        let cksum: u32 = header.iter().map(|&b| b as u32).sum();
        // write checksum as 6-digit octal + null + space
        let cksum_str = format!("{:06o}\0 ", cksum);
        header[148..156].copy_from_slice(cksum_str.as_bytes());

        let mut tar_bytes = Vec::new();
        tar_bytes.extend_from_slice(&header);
        // data block (padded to 512)
        let mut data_block = [0u8; 512];
        data_block[..payload.len()].copy_from_slice(payload);
        tar_bytes.extend_from_slice(&data_block);
        // two zero blocks (end-of-archive)
        tar_bytes.extend_from_slice(&[0u8; 1024]);

        let result = unpack(&tar_bytes);
        assert!(
            result.is_err(),
            "unpack should reject a path-traversal entry but returned Ok"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("unsafe path"),
            "error message should mention 'unsafe path', got: {err_msg}"
        );
    }
}
