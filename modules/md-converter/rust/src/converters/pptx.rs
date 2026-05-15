//! PPTX → Markdown.
//!
//! Bám sát Python markitdown `_pptx_converter.py`:
//!
//!   - mỗi slide mở đầu bằng `<!-- Slide number: N -->` (HTML comment),
//!     KHÔNG phải `## Slide N`.
//!   - title placeholder (`<p:ph type="title"/>` hoặc `"ctrTitle"`) → `# title`.
//!   - picture shapes → `![alt](filename.jpg)` placeholder (alt = descr
//!     hoặc shape name).
//!   - tables (`<a:tbl>`) → Markdown table.
//!   - notes slide (`ppt/notesSlides/notesSlide<N>.xml`) → `### Notes:` section.
//!
//! Thiếu so với python-pptx: charts, group shapes recursion, position
//! sorting (top/left), LLM image captions, keep_data_uris base64 embedding.

use std::io::{Read, Seek};
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::name::QName;
use quick_xml::Reader;

use super::tabular::rows_to_markdown;
use super::ConvertError;

pub fn convert_pptx(path: &Path) -> Result<String, ConvertError> {
    let mut file = std::fs::File::open(path)?;
    let mut head = [0u8; 4];
    let read = file.read(&mut head)?;
    file.seek(std::io::SeekFrom::Start(0))?;
    if read >= 4 && &head[0..4] == b"\xD0\xCF\x11\xE0" {
        return Err(ConvertError::Parse(
            "this is a legacy .ppt (PowerPoint 97-2003) file, not .pptx — \
             open it in PowerPoint and Save As → .pptx, then try again"
                .into(),
        ));
    }
    if read < 2 || &head[0..2] != b"PK" {
        return Err(ConvertError::Parse(format!(
            "not a valid PPTX file (missing ZIP signature, got {:02x?})",
            &head[..read.min(4)],
        )));
    }

    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| ConvertError::Parse(format!("open pptx zip: {e}")))?;

    let mut slide_paths: Vec<String> = (0..zip.len())
        .filter_map(|i| zip.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|name| name.starts_with("ppt/slides/slide") && name.ends_with(".xml"))
        .collect();
    slide_paths.sort_by_key(|n| extract_slide_number(n).unwrap_or(u32::MAX));

    let mut out = String::new();
    for (idx, name) in slide_paths.iter().enumerate() {
        let slide_no = extract_slide_number(name).unwrap_or((idx + 1) as u32);

        let mut xml = String::new();
        if let Ok(mut entry) = zip.by_name(name) {
            entry.read_to_string(&mut xml)?;
        } else {
            continue;
        }

        let slide_md = parse_slide(&xml, slide_no)?;
        out.push_str(&slide_md);

        // Notes slide: ppt/notesSlides/notesSlide<N>.xml
        let notes_path = format!("ppt/notesSlides/notesSlide{}.xml", slide_no);
        if let Ok(mut entry) = zip.by_name(&notes_path) {
            let mut notes_xml = String::new();
            if entry.read_to_string(&mut notes_xml).is_ok() {
                let notes_text = extract_all_text(&notes_xml)?;
                let cleaned = notes_text.trim();
                if !cleaned.is_empty() {
                    out.push_str("\n\n### Notes:\n");
                    out.push_str(cleaned);
                }
            }
        }
    }

    Ok(out.trim_start().to_string())
}

fn extract_slide_number(name: &str) -> Option<u32> {
    let stem = name
        .rsplit('/')
        .next()?
        .strip_prefix("slide")?
        .strip_suffix(".xml")?;
    stem.parse().ok()
}

/// Render a slide to Markdown chunk including the `<!-- Slide number -->`
/// header and shape content (text/title/image/table) in document order.
fn parse_slide(xml: &str, slide_no: u32) -> Result<String, ConvertError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();

    let mut out = String::new();
    out.push_str(&format!("\n\n<!-- Slide number: {} -->\n", slide_no));

    // Shape-level state.
    let mut in_sp = false;
    let mut sp_is_title = false;
    let mut sp_paragraphs: Vec<String> = Vec::new();
    let mut current_para = String::new();
    let mut in_text_run = false;

    // Picture state.
    let mut in_pic = false;
    let mut pic_name: String = String::new();
    let mut pic_descr: String = String::new();

    // Table state.
    let mut in_tbl = false;
    let mut tbl_rows: Vec<Vec<String>> = Vec::new();
    let mut tbl_row: Vec<String> = Vec::new();
    let mut tbl_cell: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name() {
                QName(b"p:sp") => {
                    in_sp = true;
                    sp_is_title = false;
                    sp_paragraphs.clear();
                    current_para.clear();
                }
                QName(b"p:pic") => {
                    in_pic = true;
                    pic_name.clear();
                    pic_descr.clear();
                }
                QName(b"a:tbl") => {
                    in_tbl = true;
                    tbl_rows.clear();
                }
                QName(b"a:tr") => tbl_row.clear(),
                QName(b"a:tc") => tbl_cell = Some(String::new()),
                QName(b"a:p") if in_sp || in_tbl => {
                    if in_tbl {
                        // text inside cell paragraphs accumulates to tbl_cell
                    } else if !current_para.is_empty() {
                        sp_paragraphs.push(std::mem::take(&mut current_para));
                    }
                }
                QName(b"a:t") => in_text_run = true,
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name() {
                QName(b"p:ph") => {
                    if in_sp {
                        if let Some(t) = attr(&e, b"type") {
                            if t == "title" || t == "ctrTitle" {
                                sp_is_title = true;
                            }
                        }
                    }
                }
                QName(b"p:cNvPr") => {
                    if in_pic {
                        pic_name = attr(&e, b"name").unwrap_or_default();
                        pic_descr = attr(&e, b"descr").unwrap_or_default();
                    }
                }
                QName(b"a:br") => current_para.push('\n'),
                _ => {}
            },
            Ok(Event::Text(t)) if in_text_run => {
                if let Ok(s) = t.unescape() {
                    if let Some(c) = tbl_cell.as_mut() {
                        c.push_str(&s);
                    } else {
                        current_para.push_str(&s);
                    }
                }
            }
            Ok(Event::End(e)) => match e.name() {
                QName(b"a:t") => in_text_run = false,
                QName(b"a:p") => {
                    if in_tbl {
                        // paragraph inside cell — already accumulated; add a
                        // soft break for multi-paragraph cells.
                        if let Some(c) = tbl_cell.as_mut() {
                            if !c.is_empty() && !c.ends_with(' ') {
                                c.push(' ');
                            }
                        }
                    } else if in_sp && !current_para.is_empty() {
                        sp_paragraphs.push(std::mem::take(&mut current_para));
                    }
                }
                QName(b"a:tc") => {
                    if let Some(c) = tbl_cell.take() {
                        tbl_row.push(c.trim().to_string());
                    }
                }
                QName(b"a:tr") => {
                    if !tbl_row.is_empty() {
                        tbl_rows.push(std::mem::take(&mut tbl_row));
                    }
                }
                QName(b"a:tbl") => {
                    in_tbl = false;
                    if !tbl_rows.is_empty() {
                        out.push_str(&rows_to_markdown(&tbl_rows));
                        out.push('\n');
                    }
                }
                QName(b"p:sp") => {
                    in_sp = false;
                    if !current_para.is_empty() {
                        sp_paragraphs.push(std::mem::take(&mut current_para));
                    }
                    let joined: Vec<String> = sp_paragraphs
                        .iter()
                        .map(|p| p.trim().to_string())
                        .filter(|p| !p.is_empty())
                        .collect();
                    if joined.is_empty() {
                        // skip empty shapes
                    } else if sp_is_title {
                        out.push_str("# ");
                        out.push_str(&joined.join(" "));
                        out.push('\n');
                    } else {
                        for p in &joined {
                            out.push_str(p);
                            out.push('\n');
                        }
                    }
                }
                QName(b"p:pic") => {
                    in_pic = false;
                    let alt_raw = if !pic_descr.is_empty() {
                        pic_descr.clone()
                    } else {
                        pic_name.clone()
                    };
                    let alt = alt_raw.replace(['\n', '\r', '[', ']'], " ");
                    let alt = collapse_ws(&alt);
                    let fname = sanitize_image_filename(&pic_name);
                    out.push_str(&format!("\n![{alt}]({fname})\n"));
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(ConvertError::Parse(format!("pptx xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    Ok(out)
}

fn extract_all_text(xml: &str) -> Result<String, ConvertError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();
    let mut out = String::new();
    let mut in_t = false;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name() == QName(b"a:t") {
                    in_t = true;
                }
            }
            Ok(Event::End(e)) => {
                if e.name() == QName(b"a:t") {
                    in_t = false;
                    out.push('\n');
                }
            }
            Ok(Event::Text(t)) if in_t => {
                if let Ok(s) = t.unescape() {
                    out.push_str(&s);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(ConvertError::Parse(format!("pptx notes xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == key)
        .and_then(|a| a.unescape_value().ok().map(|c| c.into_owned()))
}

fn sanitize_image_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if cleaned.is_empty() {
        "image.jpg".into()
    } else {
        format!("{cleaned}.jpg")
    }
}

fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
            }
            prev_space = true;
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}
