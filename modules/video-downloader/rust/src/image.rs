//! Images workflow — local image batch processing.
//!
//! Uses the `image` crate so we don't need an external sidecar. Each job runs
//! in a dedicated worker thread; cancellation is cooperative via an atomic
//! flag checked between files.
//!
//! Commands:
//!   - `media_image_probe`           returns dimensions/format/size for inputs
//!   - `media_image_process_start`   spawns the worker; returns `task_id`
//!   - `media_image_process_cancel`  flips the cancellation flag
//!   - `media_image_process_cleanup` removes the output directory

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageEncoder, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::events;
use crate::paths;
use crate::state::{ImageState, ImageTaskHandle};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ImageProbeResult {
    pub path: String,
    pub ok: bool,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: u64,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ImageOutputSettings {
    pub format: String, // "png" | "jpeg" | "webp"
    pub quality: u8,
    pub resize_width: Option<u32>,
    pub resize_height: Option<u32>,
    pub preserve_aspect_ratio: bool,
    pub naming_pattern: String,
}

/// Crop rectangle in source-image pixel coordinates. Out-of-range values are
/// clamped before cropping so a slightly stale frontend value can't crash
/// the worker.
#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImageJobInput {
    pub path: String,
    /// Optional per-image crop. `None` disables cropping for this file.
    pub crop: Option<CropRect>,
}

#[derive(Debug, Deserialize)]
pub struct ImageProcessArgs {
    pub files: Vec<ImageJobInput>,
    pub output: ImageOutputSettings,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ImageBatchProgress {
    pub task_id: String,
    /// "running" | "completed" | "failed" | "cancelled"
    pub status: String,
    pub total: u32,
    pub done: u32,
    pub failed: u32,
    pub current_file: Option<String>,
    pub message: Option<String>,
    pub output_dir: Option<String>,
    pub error: Option<String>,
}

// ──────────────────────────────── commands ────────────────────────────────

#[tauri::command]
pub fn media_image_probe(paths: Vec<String>) -> Result<Vec<ImageProbeResult>, String> {
    Ok(paths.into_iter().map(probe_one).collect())
}

/// Read full bytes of a local image so the frontend can build a blob URL for
/// the crop editor. We intentionally don't decode here — letting the webview
/// handle PNG/JPEG/WebP/GIF means we don't pay decode CPU twice.
#[tauri::command]
pub fn media_image_read_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
pub fn media_image_process_start(app: AppHandle, args: ImageProcessArgs) -> Result<String, String> {
    if args.files.is_empty() {
        return Err("No files provided".into());
    }
    validate_settings(&args.output)?;

    let task_id = uuid::Uuid::new_v4().to_string();
    let output_dir = paths::image_task_dir(&task_id)?;
    let cancelled: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));

    {
        let state = app.state::<ImageState>();
        state.tasks.lock().unwrap().insert(
            task_id.clone(),
            ImageTaskHandle {
                cancelled: cancelled.clone(),
                output_dir: output_dir.clone(),
            },
        );
    }

    let app_bg = app.clone();
    let task_id_bg = task_id.clone();
    let output_dir_bg = output_dir.clone();
    std::thread::spawn(move || {
        process_batch(app_bg, task_id_bg, args, output_dir_bg, cancelled);
    });

    Ok(task_id)
}

#[tauri::command]
pub fn media_image_process_cancel(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<ImageState>();
    let tasks = state.tasks.lock().unwrap();
    if let Some(handle) = tasks.get(&task_id) {
        handle.cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn media_image_process_cleanup(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<ImageState>();
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(handle) = tasks.remove(&task_id) {
        let _ = std::fs::remove_dir_all(handle.output_dir);
    }
    Ok(())
}

// ──────────────────────────────── workers ─────────────────────────────────

fn process_batch(
    app: AppHandle,
    task_id: String,
    args: ImageProcessArgs,
    output_dir: PathBuf,
    cancelled: Arc<AtomicBool>,
) {
    let total = args.files.len() as u32;
    let mut done = 0u32;
    let mut failed = 0u32;

    for (idx, input) in args.files.iter().enumerate() {
        if cancelled.load(Ordering::SeqCst) {
            emit_progress(
                &app,
                ImageBatchProgress {
                    task_id: task_id.clone(),
                    status: "cancelled".into(),
                    total,
                    done,
                    failed,
                    current_file: None,
                    message: Some("Cancelled".into()),
                    output_dir: Some(output_dir.display().to_string()),
                    error: None,
                },
            );
            return;
        }

        emit_progress(
            &app,
            ImageBatchProgress {
                task_id: task_id.clone(),
                status: "running".into(),
                total,
                done,
                failed,
                current_file: Some(input.path.clone()),
                message: None,
                output_dir: None,
                error: None,
            },
        );

        match process_one(input, idx, &args.output, &output_dir) {
            Ok(_) => done += 1,
            Err(err) => {
                failed += 1;
                log::warn!("image task {task_id}: {}: {err}", input.path);
            }
        }
    }

    emit_progress(
        &app,
        ImageBatchProgress {
            task_id: task_id.clone(),
            status: "completed".into(),
            total,
            done,
            failed,
            current_file: None,
            message: None,
            output_dir: Some(output_dir.display().to_string()),
            error: None,
        },
    );
}

fn process_one(
    input: &ImageJobInput,
    index: usize,
    settings: &ImageOutputSettings,
    output_dir: &Path,
) -> Result<PathBuf, String> {
    let path = Path::new(&input.path);
    let reader = ImageReader::open(path)
        .map_err(|e| format!("open: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("sniff: {e}"))?;
    let mut img = reader.decode().map_err(|e| format!("decode: {e}"))?;

    if let Some(rect) = input.crop {
        img = apply_crop(img, rect)?;
    }

    let (target_w, target_h) =
        compute_target_size(img.width(), img.height(), settings);
    if target_w != img.width() || target_h != img.height() {
        img = img.resize_exact(target_w, target_h, FilterType::Lanczos3);
    }

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();
    let ext = output_extension(&settings.format);
    let filename = build_output_filename(
        &settings.naming_pattern,
        &stem,
        index + 1,
        &settings.format,
        target_w,
        target_h,
        &ext,
    );
    let output_path = unique_path(output_dir, &filename, &ext);

    save_image(&img, &output_path, &settings.format, settings.quality)?;
    Ok(output_path)
}

fn apply_crop(img: image::DynamicImage, rect: CropRect) -> Result<image::DynamicImage, String> {
    let w = img.width();
    let h = img.height();
    if w == 0 || h == 0 {
        return Err("source image has zero dimensions".into());
    }
    let x = rect.x.min(w.saturating_sub(1));
    let y = rect.y.min(h.saturating_sub(1));
    let cw = rect.width.min(w - x);
    let ch = rect.height.min(h - y);
    if cw == 0 || ch == 0 {
        return Err("crop region is empty after clamping".into());
    }
    Ok(img.crop_imm(x, y, cw, ch))
}

fn compute_target_size(width: u32, height: u32, settings: &ImageOutputSettings) -> (u32, u32) {
    let target_w = settings.resize_width;
    let target_h = settings.resize_height;
    match (target_w, target_h, settings.preserve_aspect_ratio) {
        (None, None, _) => (width, height),
        (Some(w), None, _) => {
            let scale = w as f64 / width as f64;
            (w, ((height as f64 * scale).max(1.0)) as u32)
        }
        (None, Some(h), _) => {
            let scale = h as f64 / height as f64;
            (((width as f64 * scale).max(1.0)) as u32, h)
        }
        (Some(w), Some(h), false) => (w.max(1), h.max(1)),
        (Some(w), Some(h), true) => {
            let scale_w = w as f64 / width as f64;
            let scale_h = h as f64 / height as f64;
            let scale = scale_w.min(scale_h);
            (
                ((width as f64 * scale).max(1.0)) as u32,
                ((height as f64 * scale).max(1.0)) as u32,
            )
        }
    }
}

fn save_image(
    img: &image::DynamicImage,
    path: &Path,
    format: &str,
    quality: u8,
) -> Result<(), String> {
    match format {
        "jpeg" => {
            let file = std::fs::File::create(path)
                .map_err(|e| format!("create {}: {e}", path.display()))?;
            let mut writer = std::io::BufWriter::new(file);
            let q = quality.clamp(10, 100);
            // Force RGB8 — JPEG cannot store alpha.
            let rgb = img.to_rgb8();
            let encoder = JpegEncoder::new_with_quality(&mut writer, q);
            encoder
                .write_image(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8)
                .map_err(|e| format!("jpeg encode: {e}"))?;
        }
        "png" => {
            img.save_with_format(path, ImageFormat::Png)
                .map_err(|e| format!("png encode: {e}"))?;
        }
        "webp" => {
            // The `image` crate currently writes lossless WebP only; the
            // quality slider is documented as JPEG-only in the UI.
            img.save_with_format(path, ImageFormat::WebP)
                .map_err(|e| format!("webp encode: {e}"))?;
        }
        other => return Err(format!("unsupported format: {other}")),
    }
    Ok(())
}

// ──────────────────────────────── helpers ─────────────────────────────────

fn probe_one(path: String) -> ImageProbeResult {
    let p = Path::new(&path);
    let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);

    let reader = match ImageReader::open(p)
        .and_then(|r| r.with_guessed_format())
    {
        Ok(r) => r,
        Err(err) => {
            return ImageProbeResult {
                path,
                ok: false,
                width: 0,
                height: 0,
                format: String::new(),
                size,
                error: Some(format!("read: {err}")),
            }
        }
    };

    let format = reader
        .format()
        .map(format_label)
        .unwrap_or_else(|| "unknown".into());

    match reader.into_dimensions() {
        Ok((w, h)) => ImageProbeResult {
            path,
            ok: true,
            width: w,
            height: h,
            format,
            size,
            error: None,
        },
        Err(err) => ImageProbeResult {
            path,
            ok: false,
            width: 0,
            height: 0,
            format,
            size,
            error: Some(format!("dimensions: {err}")),
        },
    }
}

fn format_label(format: ImageFormat) -> String {
    match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Tiff => "tiff",
        ImageFormat::Tga => "tga",
        ImageFormat::Ico => "ico",
        ImageFormat::Avif => "avif",
        _ => "other",
    }
    .into()
}

fn output_extension(format: &str) -> String {
    match format {
        "jpeg" => "jpg".into(),
        other => other.into(),
    }
}

fn validate_settings(settings: &ImageOutputSettings) -> Result<(), String> {
    if !matches!(settings.format.as_str(), "png" | "jpeg" | "webp") {
        return Err(format!("unsupported output format: {}", settings.format));
    }
    if settings.naming_pattern.trim().is_empty() {
        return Err("naming pattern is empty".into());
    }
    Ok(())
}

fn build_output_filename(
    pattern: &str,
    stem: &str,
    index: usize,
    format: &str,
    width: u32,
    height: u32,
    ext: &str,
) -> String {
    let stem = sanitize_segment(stem);
    let raw = pattern
        .replace("{name}", &stem)
        .replace("{index}", &index.to_string())
        .replace("{format}", format)
        .replace("{width}", &width.to_string())
        .replace("{height}", &height.to_string());
    let mut name = sanitize_segment(&raw);
    if name.is_empty() {
        name = format!("image-{index}");
    }
    if name.to_ascii_lowercase().ends_with(&format!(".{}", ext.to_ascii_lowercase())) {
        name
    } else {
        format!("{name}.{ext}")
    }
}

fn sanitize_segment(input: &str) -> String {
    input
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other if other.is_control() => '_',
            other => other,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn unique_path(dir: &Path, filename: &str, ext: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();
    for i in 1..1024 {
        let candidate = dir.join(format!("{stem} ({i}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(filename.to_string())
}

fn emit_progress(app: &AppHandle, payload: ImageBatchProgress) {
    let _ = app.emit(events::IMAGE_PROGRESS, payload);
}
