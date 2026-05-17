use crate::error::AppResult;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub struct CopyResult {
    pub copied: usize,
    pub skipped: usize,
    pub deleted: usize,
}

/// Copy toàn bộ nội dung từ source → staging (overwrite)
/// Chỉ copy files, không copy .git directory
pub fn copy_to_staging(source: &Path, staging: &Path) -> AppResult<CopyResult> {
    copy_to_staging_with_excludes(source, staging, &HashSet::new())
}

/// Copy toàn bộ nội dung từ source → staging, excluding specified top-level dir names
pub fn copy_to_staging_with_excludes(
    source: &Path,
    staging: &Path,
    exclude_dirs: &HashSet<String>,
) -> AppResult<CopyResult> {
    if !source.exists() {
        return Err(crate::error::AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Source path not found",
        )));
    }

    if source.is_file() {
        if let Some(parent) = staging.parent() {
            fs::create_dir_all(parent)?;
        }
        let should_copy = if staging.exists() {
            let src_modified = fs::metadata(source)?.modified()?;
            let dst_modified = fs::metadata(staging)?.modified()?;
            src_modified > dst_modified
        } else {
            true
        };
        if should_copy {
            fs::copy(source, staging)?;
        }
        return Ok(CopyResult {
            copied: usize::from(should_copy),
            skipped: 0,
            deleted: 0,
        });
    }

    fs::create_dir_all(staging)?;

    let mut copied = 0;
    let mut skipped = 0;

    copy_dir_recursive(
        source,
        staging,
        &mut copied,
        &mut skipped,
        exclude_dirs,
        true,
    )?;

    // Xoá files trong staging mà không còn ở source
    let deleted = remove_orphaned(source, staging, exclude_dirs, true)?;

    Ok(CopyResult {
        copied,
        skipped,
        deleted,
    })
}

/// Copy từ staging → source (cho pull, Mirrored strategy)
pub fn copy_from_staging(staging: &Path, source: &Path) -> AppResult<CopyResult> {
    copy_to_staging(staging, source)
}

/// Copy từ staging → source, excluding specified top-level dir names
pub fn copy_from_staging_with_excludes(
    staging: &Path,
    source: &Path,
    exclude_dirs: &HashSet<String>,
) -> AppResult<CopyResult> {
    copy_to_staging_with_excludes(staging, source, exclude_dirs)
}

fn copy_dir_recursive(
    source: &Path,
    dest: &Path,
    copied: &mut usize,
    skipped: &mut usize,
    exclude_dirs: &HashSet<String>,
    is_top_level: bool,
) -> AppResult<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Skip .git, .DS_Store, node_modules, etc.
        if should_skip(&name_str) {
            *skipped += 1;
            continue;
        }

        // Skip excluded dirs at top level only
        if is_top_level && entry.path().is_dir() && exclude_dirs.contains(name_str.as_ref()) {
            *skipped += 1;
            continue;
        }

        let src_path = entry.path();
        let dst_path = dest.join(&name);

        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)?;
            copy_dir_recursive(&src_path, &dst_path, copied, skipped, exclude_dirs, false)?;
        } else {
            // Only copy if content changed (compare modified time)
            let should_copy = if dst_path.exists() {
                let src_modified = fs::metadata(&src_path)?.modified()?;
                let dst_modified = fs::metadata(&dst_path)?.modified()?;
                src_modified > dst_modified
            } else {
                true
            };

            if should_copy {
                fs::copy(&src_path, &dst_path)?;
                *copied += 1;
            }
        }
    }
    Ok(())
}

fn should_skip(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".DS_Store" | "node_modules" | ".open-sesame" | "Thumbs.db"
    )
}

/// Xoá files trong dest mà không tồn tại ở source
fn remove_orphaned(
    source: &Path,
    dest: &Path,
    exclude_dirs: &HashSet<String>,
    is_top_level: bool,
) -> AppResult<usize> {
    let mut deleted = 0;

    for entry in fs::read_dir(dest)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if should_skip(&name_str) {
            continue;
        }

        // Don't delete excluded dirs at top level
        if is_top_level && entry.path().is_dir() && exclude_dirs.contains(name_str.as_ref()) {
            continue;
        }

        let src_path = source.join(&name);
        let dst_path = entry.path();

        if !src_path.exists() {
            if dst_path.is_dir() {
                fs::remove_dir_all(&dst_path)?;
            } else {
                fs::remove_file(&dst_path)?;
            }
            deleted += 1;
        } else if dst_path.is_dir() && src_path.is_dir() {
            deleted += remove_orphaned(&src_path, &dst_path, exclude_dirs, false)?;
        }
    }

    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_files(dir: &Path) {
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("readme.md"), "# Hello").unwrap();
        fs::write(dir.join("sub/doc.md"), "# Sub doc").unwrap();
    }

    #[test]
    fn test_copy_to_staging_basic() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let staging = tmp.path().join("staging");
        create_test_files(&source);

        let result = copy_to_staging(&source, &staging).unwrap();
        assert_eq!(result.copied, 2);
        assert!(staging.join("readme.md").exists());
        assert!(staging.join("sub/doc.md").exists());
    }

    #[test]
    fn test_copy_skips_git_directory() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let staging = tmp.path().join("staging");
        create_test_files(&source);
        fs::create_dir(source.join(".git")).unwrap();
        fs::write(source.join(".git/config"), "test").unwrap();

        copy_to_staging(&source, &staging).unwrap();
        assert!(!staging.join(".git").exists());
    }

    #[test]
    fn test_copy_skips_node_modules() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let staging = tmp.path().join("staging");
        fs::create_dir_all(source.join("node_modules/pkg")).unwrap();
        fs::write(source.join("readme.md"), "hi").unwrap();

        copy_to_staging(&source, &staging).unwrap();
        assert!(!staging.join("node_modules").exists());
        assert!(staging.join("readme.md").exists());
    }

    #[test]
    fn test_copy_only_changed_files() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let staging = tmp.path().join("staging");
        create_test_files(&source);

        // First copy
        let r1 = copy_to_staging(&source, &staging).unwrap();
        assert_eq!(r1.copied, 2);

        // Second copy without changes → should skip
        let r2 = copy_to_staging(&source, &staging).unwrap();
        assert_eq!(r2.copied, 0);

        // Modify a file → should copy only that one
        std::thread::sleep(std::time::Duration::from_millis(100));
        fs::write(source.join("readme.md"), "# Changed").unwrap();
        let r3 = copy_to_staging(&source, &staging).unwrap();
        assert_eq!(r3.copied, 1);
    }

    #[test]
    fn test_remove_orphaned_files() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let staging = tmp.path().join("staging");
        create_test_files(&source);
        copy_to_staging(&source, &staging).unwrap();

        // Xoá file ở source
        fs::remove_file(source.join("sub/doc.md")).unwrap();

        let result = copy_to_staging(&source, &staging).unwrap();
        assert_eq!(result.deleted, 1);
        assert!(!staging.join("sub/doc.md").exists());
    }

    #[test]
    fn test_source_not_found() {
        let tmp = TempDir::new().unwrap();
        let result = copy_to_staging(&tmp.path().join("nonexistent"), &tmp.path().join("staging"));
        assert!(result.is_err());
    }

    #[test]
    fn test_copy_with_excludes() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let dest = tmp.path().join("dest");
        create_test_files(&source);
        // Add a dir that should be excluded
        fs::create_dir_all(source.join("wasabi")).unwrap();
        fs::write(source.join("wasabi/notes.md"), "notes").unwrap();

        let excludes: HashSet<String> = ["wasabi".to_string()].into();
        let result = copy_to_staging_with_excludes(&source, &dest, &excludes).unwrap();

        assert!(dest.join("readme.md").exists());
        assert!(dest.join("sub/doc.md").exists());
        assert!(!dest.join("wasabi").exists(), "wasabi should be excluded");
        assert_eq!(result.copied, 2);
    }

    #[test]
    fn test_remove_orphaned_respects_excludes() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("source");
        let dest = tmp.path().join("dest");

        // Setup source
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("readme.md"), "hi").unwrap();

        // Setup dest with an "extra" dir that is excluded
        fs::create_dir_all(dest.join("wasabi")).unwrap();
        fs::write(dest.join("wasabi/notes.md"), "notes").unwrap();

        let excludes: HashSet<String> = ["wasabi".to_string()].into();
        copy_to_staging_with_excludes(&source, &dest, &excludes).unwrap();

        assert!(
            dest.join("wasabi/notes.md").exists(),
            "wasabi should not be deleted"
        );
    }
}
