//! EPUB → Markdown.
//!
//! EPUB is a ZIP with HTML/XHTML chapters listed in a manifest. We avoid
//! pulling a heavy EPUB crate — instead read the container.xml to locate
//! the OPF, parse the spine to get chapter order, then convert each
//! chapter's XHTML to Markdown with `htmd`.

use std::io::Read;
use std::path::{Path, PathBuf};

use quick_xml::events::Event;
use quick_xml::name::QName;
use quick_xml::Reader;

use super::ConvertError;

pub fn convert_epub(path: &Path) -> Result<String, ConvertError> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| ConvertError::Parse(format!("open epub zip: {e}")))?;

    let opf_path = locate_opf(&mut zip)?;
    let opf_xml = read_zip_entry(&mut zip, &opf_path)?;
    let (manifest, spine) = parse_opf(&opf_xml)?;

    let base_dir = PathBuf::from(&opf_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    let mut out = String::new();
    for idref in spine {
        let Some(href) = manifest.iter().find_map(|(id, href)| {
            if *id == idref {
                Some(href.clone())
            } else {
                None
            }
        }) else {
            continue;
        };
        let full = join_zip_path(&base_dir, &href);
        let content = match read_zip_entry(&mut zip, &full) {
            Ok(c) => c,
            Err(_) => continue,
        };
        match htmd::convert(&content) {
            Ok(md) => {
                out.push_str(md.trim_end());
                out.push_str("\n\n");
            }
            Err(_) => continue,
        }
    }

    Ok(out.trim_end().to_string() + "\n")
}

fn locate_opf<R: std::io::Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
) -> Result<String, ConvertError> {
    let container = read_zip_entry(zip, "META-INF/container.xml")?;
    let mut reader = Reader::from_str(&container);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.name() == QName(b"rootfile") {
                    if let Some(path) = attr(&e, b"full-path") {
                        return Ok(path);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(ConvertError::Parse(format!("epub container: {e}"))),
            _ => {}
        }
        buf.clear();
    }
    Err(ConvertError::Parse("epub: no rootfile in container.xml".into()))
}

fn parse_opf(xml: &str) -> Result<(Vec<(String, String)>, Vec<String>), ConvertError> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut manifest: Vec<(String, String)> = Vec::new();
    let mut spine: Vec<String> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match e.name() {
                QName(b"item") => {
                    if let (Some(id), Some(href)) = (attr(&e, b"id"), attr(&e, b"href")) {
                        // Filter to text content only (skip images/css).
                        let media = attr(&e, b"media-type").unwrap_or_default();
                        if media.contains("html") || media.contains("xml") || media.is_empty() {
                            manifest.push((id, href));
                        }
                    }
                }
                QName(b"itemref") => {
                    if let Some(idref) = attr(&e, b"idref") {
                        spine.push(idref);
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(ConvertError::Parse(format!("epub opf: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    Ok((manifest, spine))
}

fn read_zip_entry<R: std::io::Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<String, ConvertError> {
    let mut entry = zip
        .by_name(name)
        .map_err(|e| ConvertError::Parse(format!("zip entry {name}: {e}")))?;
    let mut content = String::new();
    entry.read_to_string(&mut content)?;
    Ok(content)
}

fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == key)
        .and_then(|a| a.unescape_value().ok().map(|c| c.into_owned()))
}

fn join_zip_path(base: &Path, href: &str) -> String {
    let mut joined = base.join(href);
    // Zip paths use forward slashes; normalize.
    let s = joined.to_string_lossy().replace('\\', "/");
    // Resolve `..` segments manually.
    let mut parts: Vec<&str> = Vec::new();
    for seg in s.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    joined.clear();
    parts.join("/")
}
