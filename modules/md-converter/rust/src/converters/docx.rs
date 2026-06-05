//! DOCX → Markdown.
//!
//! Python markitdown pipes DOCX → mammoth (DOCX → HTML) → CustomMarkdownify.
//! No 1:1 Rust replacement for mammoth exists, so we parse `word/document.xml`
//! directly with quick-xml and emit Markdown. Bám sát mammoth ở các điểm
//! quan trọng:
//!
//!   - field codes (`<w:instrText>`, `<w:fldChar>`) bị strip — chỉ giữ
//!     phần result hiển thị, không leak instruction text như `TOC \o ...`
//!     hay `PAGEREF _Toc... \h`.
//!   - hyperlinks (`<w:hyperlink r:id="rId1">`) resolve qua
//!     `word/_rels/document.xml.rels` → `[text](url)`.
//!   - list items có nested level (`<w:numPr>/<w:ilvl w:val="N">`) →
//!     indent 2 space mỗi level.
//!   - heading style (`Heading1..Heading6`, "Title") → `# `..`###### `.
//!   - drawings/images → `![alt](name)` placeholder dùng
//!     `<wp:docPr name= descr=>`.
//!   - bold/italic runs (`<w:b/>`, `<w:i/>`) → `**` / `*`.
//!   - tables (`<w:tbl>`) → Markdown table.
//!
//! Thiếu so với mammoth: footnotes/endnotes, comments, complex equations
//! (mammoth dùng OMML→LaTeX preprocessor), embedded objects, text boxes,
//! style_map customization, image extraction (chỉ emit placeholder).

use std::collections::HashMap;
use std::io::{Read, Seek};
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::name::QName;
use quick_xml::Reader;

use super::tabular::rows_to_markdown;
use super::ConvertError;

pub fn convert_docx(path: &Path) -> Result<String, ConvertError> {
    let mut file = std::fs::File::open(path)?;

    let mut head = [0u8; 8];
    let read = file.read(&mut head)?;
    file.seek(std::io::SeekFrom::Start(0))?;

    if read >= 4 && &head[0..4] == b"\xD0\xCF\x11\xE0" {
        return Err(ConvertError::Parse(
            "this is a legacy .doc (Word 97-2003) file, not .docx — \
             open it in Word and Save As → .docx, then try again"
                .into(),
        ));
    }
    if read < 4 || &head[0..2] != b"PK" {
        return Err(ConvertError::Parse(format!(
            "not a valid DOCX file (missing ZIP signature, got {:02x?})",
            &head[..read.min(4)],
        )));
    }

    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| ConvertError::Parse(format!("open docx zip: {e}")))?;

    let rels = read_zip_text(&mut zip, "word/_rels/document.xml.rels")
        .ok()
        .map(|s| parse_rels(&s))
        .unwrap_or_default();

    let document_xml = read_zip_text(&mut zip, "word/document.xml")
        .map_err(|e| ConvertError::Parse(format!("read document.xml: {e}")))?;

    parse_document(&document_xml, &rels)
}

fn read_zip_text<R: Read + Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<String, ConvertError> {
    let mut entry = zip
        .by_name(name)
        .map_err(|e| ConvertError::Parse(format!("zip {name}: {e}")))?;
    let mut s = String::new();
    entry.read_to_string(&mut s)?;
    Ok(s)
}

fn parse_rels(xml: &str) -> HashMap<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut out = HashMap::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name() == QName(b"Relationship") => {
                let id = attr(&e, b"Id");
                let target = attr(&e, b"Target");
                if let (Some(id), Some(target)) = (id, target) {
                    out.insert(id, target);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

// ---- Document parsing ----

#[derive(Default, Clone)]
struct ParaInfo {
    style: Option<String>,
    list_level: Option<u32>,
    is_list_item: bool,
}

/// State of a Word field (`<w:fldChar>` chain).
/// - Begin: just past `<w:fldChar w:fldCharType="begin">` — text we see
///   here is the instruction (e.g. ` TOC \o "1-3" \h ` or `PAGEREF ...`).
/// - Result: after `<w:fldChar w:fldCharType="separate">` — text we see
///   is the rendered value (e.g. the page number, the hyperlink anchor).
/// - None: not inside a field.
#[derive(Clone, Copy, PartialEq)]
enum FieldPhase {
    None,
    Instruction,
    Result,
}

fn parse_document(xml: &str, rels: &HashMap<String, String>) -> Result<String, ConvertError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut out = String::new();
    let mut buf = Vec::new();

    let mut in_body = false;
    let mut paragraph: Option<ParaInfo> = None;
    let mut current = String::new();
    let mut table: Option<Vec<Vec<String>>> = None;
    let mut row: Option<Vec<String>> = None;
    let mut cell: Option<String> = None;

    // Run-level state (inside a <w:r>).
    let mut run_bold = false;
    let mut run_italic = false;

    // Field state.
    let mut field_phase = FieldPhase::None;
    let mut field_instr = String::new();
    let mut in_instr_text = false;

    // Hyperlink stack — stores rId or anchor; we close on `</w:hyperlink>`.
    let mut hyperlink_stack: Vec<Option<String>> = Vec::new();
    let mut hyperlink_text: Vec<String> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name() {
                QName(b"w:body") => in_body = true,
                QName(b"w:p") if in_body => paragraph = Some(ParaInfo::default()),
                QName(b"w:tbl") if in_body => table = Some(Vec::new()),
                QName(b"w:tr") => row = Some(Vec::new()),
                QName(b"w:tc") => cell = Some(String::new()),
                QName(b"w:pStyle") => {
                    if let Some(p) = paragraph.as_mut() {
                        if let Some(v) = attr(&e, b"w:val") {
                            p.style = Some(v);
                        }
                    }
                }
                QName(b"w:numPr") => {
                    if let Some(p) = paragraph.as_mut() {
                        p.is_list_item = true;
                    }
                }
                QName(b"w:ilvl") => {
                    if let Some(p) = paragraph.as_mut() {
                        if let Some(v) = attr(&e, b"w:val") {
                            p.list_level = v.parse().ok();
                        }
                    }
                }
                QName(b"w:instrText") => in_instr_text = true,
                QName(b"w:hyperlink") => {
                    let target = attr(&e, b"r:id")
                        .and_then(|id| rels.get(&id).cloned())
                        .or_else(|| attr(&e, b"w:anchor").map(|a| format!("#{a}")));
                    hyperlink_stack.push(target);
                    hyperlink_text.push(String::new());
                }
                QName(b"w:r") => {
                    run_bold = false;
                    run_italic = false;
                }
                QName(b"w:b") => run_bold = true,
                QName(b"w:i") => run_italic = true,
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name() {
                QName(b"w:pStyle") => {
                    if let Some(p) = paragraph.as_mut() {
                        if let Some(v) = attr(&e, b"w:val") {
                            p.style = Some(v);
                        }
                    }
                }
                QName(b"w:ilvl") => {
                    if let Some(p) = paragraph.as_mut() {
                        if let Some(v) = attr(&e, b"w:val") {
                            p.list_level = v.parse().ok();
                        }
                    }
                }
                QName(b"w:b") => run_bold = true,
                QName(b"w:i") => run_italic = true,
                QName(b"w:br") | QName(b"w:cr") => append_text(
                    "\n",
                    &mut current,
                    &mut hyperlink_text,
                    field_phase,
                    &mut field_instr,
                    in_instr_text,
                ),
                QName(b"w:tab") => append_text(
                    "\t",
                    &mut current,
                    &mut hyperlink_text,
                    field_phase,
                    &mut field_instr,
                    in_instr_text,
                ),
                QName(b"w:fldChar") => match attr(&e, b"w:fldCharType").as_deref() {
                    Some("begin") => {
                        field_phase = FieldPhase::Instruction;
                        field_instr.clear();
                    }
                    Some("separate") => field_phase = FieldPhase::Result,
                    Some("end") => {
                        // Common field kinds: HYPERLINK, PAGEREF, TOC.
                        // For HYPERLINK we already have the rendered text in
                        // `current` (or `hyperlink_text` if wrapped). The
                        // displayed anchor was emitted during the Result
                        // phase, so we just clear instruction now.
                        field_phase = FieldPhase::None;
                        field_instr.clear();
                    }
                    _ => {}
                },
                QName(b"wp:docPr") => {
                    // Image placeholder — best-effort alt/name.
                    let name = attr(&e, b"name").unwrap_or_default();
                    let descr = attr(&e, b"descr").unwrap_or_default();
                    let alt = if !descr.is_empty() {
                        descr
                    } else {
                        name.clone()
                    };
                    let alt = alt.replace(['\n', '\r'], " ");
                    let img = format!("![{}]({})", alt, sanitize_filename(&name));
                    append_text(
                        &img,
                        &mut current,
                        &mut hyperlink_text,
                        field_phase,
                        &mut field_instr,
                        in_instr_text,
                    );
                }
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if let Ok(s) = t.unescape() {
                    if in_instr_text || field_phase == FieldPhase::Instruction {
                        // Collect instruction text but never emit it.
                        field_instr.push_str(&s);
                    } else {
                        let formatted = wrap_emphasis(&s, run_bold, run_italic);
                        append_text(
                            &formatted,
                            &mut current,
                            &mut hyperlink_text,
                            field_phase,
                            &mut field_instr,
                            in_instr_text,
                        );
                    }
                }
            }
            Ok(Event::End(e)) => match e.name() {
                QName(b"w:instrText") => in_instr_text = false,
                QName(b"w:hyperlink") => {
                    let target = hyperlink_stack.pop().flatten();
                    let text = hyperlink_text.pop().unwrap_or_default();
                    let rendered = if let Some(href) = target {
                        if text.is_empty() {
                            String::new()
                        } else {
                            format!("[{text}]({})", escape_url(&href))
                        }
                    } else {
                        text
                    };
                    append_text(
                        &rendered,
                        &mut current,
                        &mut hyperlink_text,
                        field_phase,
                        &mut field_instr,
                        in_instr_text,
                    );
                }
                QName(b"w:p") => {
                    let text = std::mem::take(&mut current);
                    let p = paragraph.take().unwrap_or_default();
                    let line = format_paragraph(&p, &text);
                    if let Some(c) = cell.as_mut() {
                        if !c.is_empty() {
                            c.push(' ');
                        }
                        c.push_str(&line);
                    } else if !line.is_empty() {
                        out.push_str(&line);
                        out.push_str("\n\n");
                    }
                }
                QName(b"w:tc") => {
                    if let (Some(row), Some(c)) = (row.as_mut(), cell.take()) {
                        row.push(c);
                    }
                }
                QName(b"w:tr") => {
                    if let (Some(tbl), Some(r)) = (table.as_mut(), row.take()) {
                        tbl.push(r);
                    }
                }
                QName(b"w:tbl") => {
                    if let Some(rows) = table.take() {
                        if !rows.is_empty() {
                            out.push_str(&rows_to_markdown(&rows));
                            out.push('\n');
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(ConvertError::Parse(format!("docx xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    Ok(out.trim_end().to_string() + "\n")
}

fn append_text(
    s: &str,
    current: &mut String,
    hyperlink_text: &mut [String],
    field_phase: FieldPhase,
    field_instr: &mut String,
    in_instr_text: bool,
) {
    if in_instr_text || field_phase == FieldPhase::Instruction {
        field_instr.push_str(s);
        return;
    }
    if let Some(top) = hyperlink_text.last_mut() {
        top.push_str(s);
    } else {
        current.push_str(s);
    }
}

fn wrap_emphasis(text: &str, bold: bool, italic: bool) -> String {
    let trimmed_visible = text.trim().is_empty();
    if trimmed_visible {
        return text.to_string();
    }
    let prefix = match (bold, italic) {
        (true, true) => "***",
        (true, false) => "**",
        (false, true) => "*",
        (false, false) => "",
    };
    if prefix.is_empty() {
        text.to_string()
    } else {
        // Preserve leading/trailing whitespace outside the emphasis.
        let leading: String = text.chars().take_while(|c| c.is_whitespace()).collect();
        let trailing: String = text
            .chars()
            .rev()
            .take_while(|c| c.is_whitespace())
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        let core = text.trim();
        format!("{leading}{prefix}{core}{prefix}{trailing}")
    }
}

fn format_paragraph(p: &ParaInfo, text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some(style) = p.style.as_deref() {
        if let Some(level) = heading_level(style) {
            return format!("{} {}", "#".repeat(level), trimmed);
        }
        if style.eq_ignore_ascii_case("Title") {
            return format!("# {trimmed}");
        }
    }

    if p.is_list_item {
        let indent = "  ".repeat(p.list_level.unwrap_or(0) as usize);
        return format!("{indent}- {trimmed}");
    }

    trimmed.to_string()
}

fn heading_level(style: &str) -> Option<usize> {
    let s = style.to_ascii_lowercase().replace([' ', '_'], "");
    if let Some(rest) = s.strip_prefix("heading") {
        if let Ok(n) = rest.parse::<usize>() {
            if (1..=6).contains(&n) {
                return Some(n);
            }
        }
    }
    None
}

fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == key)
        .and_then(|a| a.unescape_value().ok().map(|c| c.into_owned()))
}

fn escape_url(s: &str) -> String {
    s.replace(' ', "%20")
        .replace(')', "%29")
        .replace('(', "%28")
}

fn sanitize_filename(name: &str) -> String {
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
