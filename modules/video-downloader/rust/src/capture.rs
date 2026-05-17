//! Capture workflow — yt-dlp + ffmpeg sidecars driving URL-based downloads.
//!
//! Commands:
//!   - `video_info`              fetch metadata
//!   - `video_download_start`    spawn yt-dlp; returns `task_id` immediately
//!   - `video_download_cancel`   kills the yt-dlp child
//!   - `video_download_read`     read finished file bytes (for Save dialog)
//!   - `video_download_cleanup`  delete finished file
//!
//! Progress is streamed on the [`events::CAPTURE_PROGRESS`] window event.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::events;
use crate::paths;
use crate::state::{CaptureState, CaptureTaskHandle};

const SIDECAR: &str = "yt-dlp";

// ───────────────────────────── public API types ─────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<i64>,
    pub filesize_approx: Option<i64>,
    pub tbr: Option<f64>,
    pub abr: Option<f64>,
    pub note: Option<String>,
    pub has_video: bool,
    pub has_audio: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoInfo {
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub duration_string: Option<String>,
    pub channel: Option<String>,
    pub view_count: Option<i64>,
    pub upload_date: Option<String>,
    pub video_formats: Vec<VideoFormat>,
    pub audio_formats: Vec<VideoFormat>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadArgs {
    pub url: String,
    pub format_id: String,
    /// "mp4" or "mp3"
    pub output_type: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct DownloadProgress {
    pub task_id: String,
    /// "pending" | "downloading" | "processing" | "completed" | "failed" | "cancelled"
    pub status: String,
    pub progress: f32,
    pub speed: String,
    pub eta: String,
    pub file_size: i64,
    pub filename: Option<String>,
    pub filepath: Option<String>,
    pub error: Option<String>,
}

// ───────────────────────────────── commands ─────────────────────────────────

#[tauri::command]
pub async fn video_info(app: AppHandle, url: String) -> Result<VideoInfo, String> {
    let cmd = app
        .shell()
        .sidecar(SIDECAR)
        .map_err(|e| format!("yt-dlp sidecar unavailable: {e}. Bundled binaries phải có ở src-tauri/binaries/"))?
        .args(["--dump-single-json", "--no-warnings", "--no-download", &url]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("yt-dlp spawn: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("parse yt-dlp json: {e}"))?;
    Ok(parse_info(&json))
}

#[tauri::command]
pub async fn video_download_start(app: AppHandle, args: DownloadArgs) -> Result<String, String> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let download_dir = paths::downloads_dir()?;
    let outtmpl = download_dir.join(format!("{task_id}.%(ext)s"));

    let format_arg = if args.output_type == "mp3" {
        args.format_id.clone()
    } else {
        format!("{}+bestaudio[ext=m4a]/best", args.format_id)
    };

    // `--newline` switches yt-dlp to one-progress-per-line so we can parse
    // each line as it arrives. The custom template makes parsing trivial.
    let mut yt_args: Vec<String> = vec![
        "--no-warnings".into(),
        "--newline".into(),
        "--progress-template".into(),
        "[progress]%(progress.downloaded_bytes)s/%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s".into(),
        "-f".into(),
        format_arg,
        "-o".into(),
        outtmpl.to_string_lossy().to_string(),
        "--no-playlist".into(),
        args.url.clone(),
    ];

    if args.output_type == "mp3" {
        yt_args.extend(["--extract-audio".into(), "--audio-format".into(), "mp3".into()]);
    } else {
        yt_args.extend(["--merge-output-format".into(), "mp4".into()]);
    }

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR)
        .map_err(|e| format!("yt-dlp sidecar: {e}"))?
        .args(yt_args)
        .spawn()
        .map_err(|e| format!("yt-dlp spawn: {e}"))?;

    {
        let state = app.state::<CaptureState>();
        state.tasks.lock().unwrap().insert(
            task_id.clone(),
            CaptureTaskHandle {
                child: Some(child),
                output_dir: download_dir.clone(),
                output_type: args.output_type.clone(),
                cancelled: false,
            },
        );
    }

    let task_id_bg = task_id.clone();
    let app_bg = app.clone();
    let output_type_bg = args.output_type.clone();
    let download_dir_bg = download_dir.clone();
    tokio::spawn(async move {
        let mut last_size: i64 = 0;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some((pct, downloaded, total, speed, eta)) = parse_progress(&text) {
                        if total > 0 {
                            last_size = total;
                        }
                        let _ = app_bg.emit(
                            events::CAPTURE_PROGRESS,
                            DownloadProgress {
                                task_id: task_id_bg.clone(),
                                status: "downloading".into(),
                                progress: pct,
                                speed,
                                eta,
                                file_size: if total > 0 { total } else { downloaded },
                                filename: None,
                                filepath: None,
                                error: None,
                            },
                        );
                    }
                }
                CommandEvent::Stderr(_) => { /* swallow */ }
                CommandEvent::Terminated(payload) => {
                    let success = payload.code.unwrap_or(-1) == 0;
                    let cancelled = {
                        let state = app_bg.state::<CaptureState>();
                        let guard = state.tasks.lock().unwrap();
                        guard.get(&task_id_bg).map(|t| t.cancelled).unwrap_or(false)
                    };

                    let (status, filepath, filename, error) = if cancelled {
                        ("cancelled".to_string(), None, None, None)
                    } else if success {
                        match find_output_file(&download_dir_bg, &task_id_bg, &output_type_bg) {
                            Some(p) => {
                                let fname = p.file_name().map(|s| s.to_string_lossy().to_string());
                                (
                                    "completed".into(),
                                    Some(p.to_string_lossy().to_string()),
                                    fname,
                                    None,
                                )
                            }
                            None => ("failed".into(), None, None, Some("output file not found".into())),
                        }
                    } else {
                        (
                            "failed".into(),
                            None,
                            None,
                            Some(format!("yt-dlp exit code {:?}", payload.code)),
                        )
                    };

                    let _ = app_bg.emit(
                        events::CAPTURE_PROGRESS,
                        DownloadProgress {
                            task_id: task_id_bg.clone(),
                            status,
                            progress: 100.0,
                            speed: String::new(),
                            eta: String::new(),
                            file_size: last_size,
                            filename,
                            filepath,
                            error,
                        },
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(task_id)
}

#[tauri::command]
pub fn video_download_cancel(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<CaptureState>();
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(handle) = tasks.get_mut(&task_id) {
        handle.cancelled = true;
        if let Some(child) = handle.child.take() {
            let _ = child.kill();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn video_download_read(app: AppHandle, task_id: String) -> Result<Vec<u8>, String> {
    let state = app.state::<CaptureState>();
    let tasks = state.tasks.lock().unwrap();
    let handle = tasks.get(&task_id).ok_or_else(|| "task not found".to_string())?;
    let path = find_output_file(&handle.output_dir, &task_id, &handle.output_type)
        .ok_or_else(|| "output file not found".to_string())?;
    std::fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))
}

#[tauri::command]
pub fn video_download_cleanup(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<CaptureState>();
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(handle) = tasks.remove(&task_id) {
        if let Some(path) = find_output_file(&handle.output_dir, &task_id, &handle.output_type) {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

// ───────────────────────────────── helpers ──────────────────────────────────

fn parse_info(j: &serde_json::Value) -> VideoInfo {
    let mut video_formats: Vec<VideoFormat> = Vec::new();
    let mut audio_formats: Vec<VideoFormat> = Vec::new();

    if let Some(formats) = j.get("formats").and_then(|v| v.as_array()) {
        for f in formats {
            let vcodec = f.get("vcodec").and_then(|v| v.as_str()).map(String::from);
            let acodec = f.get("acodec").and_then(|v| v.as_str()).map(String::from);
            let has_video = vcodec.as_deref().map(|c| c != "none").unwrap_or(false);
            let has_audio = acodec.as_deref().map(|c| c != "none").unwrap_or(false);

            let fmt = VideoFormat {
                format_id: f.get("format_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                ext: f.get("ext").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                resolution: f.get("resolution").and_then(|v| v.as_str()).map(String::from),
                fps: f.get("fps").and_then(|v| v.as_f64()),
                vcodec,
                acodec,
                filesize: f.get("filesize").and_then(|v| v.as_i64()),
                filesize_approx: f.get("filesize_approx").and_then(|v| v.as_i64()),
                tbr: f.get("tbr").and_then(|v| v.as_f64()),
                abr: f.get("abr").and_then(|v| v.as_f64()),
                note: f.get("format_note").and_then(|v| v.as_str()).map(String::from),
                has_video,
                has_audio,
            };

            if has_video {
                video_formats.push(fmt);
            } else if has_audio {
                audio_formats.push(fmt);
            }
        }
    }

    video_formats.sort_by(|a, b| {
        b.tbr
            .unwrap_or(0.0)
            .partial_cmp(&a.tbr.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    audio_formats.sort_by(|a, b| {
        b.abr
            .unwrap_or(0.0)
            .partial_cmp(&a.abr.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    VideoInfo {
        title: j.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        thumbnail: j.get("thumbnail").and_then(|v| v.as_str()).map(String::from),
        duration: j.get("duration").and_then(|v| v.as_f64()),
        duration_string: j.get("duration_string").and_then(|v| v.as_str()).map(String::from),
        channel: j
            .get("channel")
            .or_else(|| j.get("uploader"))
            .and_then(|v| v.as_str())
            .map(String::from),
        view_count: j.get("view_count").and_then(|v| v.as_i64()),
        upload_date: j.get("upload_date").and_then(|v| v.as_str()).map(String::from),
        video_formats,
        audio_formats,
    }
}

fn parse_progress(line: &str) -> Option<(f32, i64, i64, String, String)> {
    // Custom template: `[progress]<downloaded>/<total>|<speed>|<eta>`
    // Fields may be "NA" if yt-dlp doesn't know yet.
    let payload = line.trim().strip_prefix("[progress]")?;
    let parts: Vec<&str> = payload.split('|').collect();
    if parts.len() < 3 {
        return None;
    }
    let bytes_part = parts[0];
    let speed_raw = parts[1].trim();
    let eta_raw = parts[2].trim();

    let (dl_str, total_str) = bytes_part.split_once('/').unwrap_or((bytes_part, "NA"));
    let downloaded: i64 = dl_str.trim().parse().unwrap_or(0);
    let total: i64 = total_str.trim().parse().unwrap_or(0);

    let pct = if total > 0 {
        (downloaded as f32 / total as f32 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let speed = if speed_raw == "NA" || speed_raw.is_empty() {
        String::new()
    } else {
        format_speed(speed_raw.parse::<f64>().unwrap_or(0.0))
    };
    let eta = if eta_raw == "NA" || eta_raw.is_empty() {
        String::new()
    } else {
        format_eta(eta_raw.parse::<i64>().unwrap_or(0))
    };

    Some((pct, downloaded, total, speed, eta))
}

fn format_speed(b_per_s: f64) -> String {
    if b_per_s <= 0.0 {
        return String::new();
    }
    if b_per_s >= 1_048_576.0 {
        format!("{:.1} MB/s", b_per_s / 1_048_576.0)
    } else if b_per_s >= 1024.0 {
        format!("{:.1} KB/s", b_per_s / 1024.0)
    } else {
        format!("{:.0} B/s", b_per_s)
    }
}

fn format_eta(s: i64) -> String {
    if s <= 0 {
        return String::new();
    }
    if s >= 3600 {
        format!("{}h {}m", s / 3600, (s % 3600) / 60)
    } else if s >= 60 {
        format!("{}m {}s", s / 60, s % 60)
    } else {
        format!("{}s", s)
    }
}

fn find_output_file(dir: &Path, task_id: &str, output_type: &str) -> Option<PathBuf> {
    let preferred_ext = if output_type == "mp3" { "mp3" } else { "mp4" };
    let preferred = dir.join(format!("{task_id}.{preferred_ext}"));
    if preferred.exists() {
        return Some(preferred);
    }
    // Fallback — any file matching `<task_id>.*`.
    if let Ok(read) = std::fs::read_dir(dir) {
        for entry in read.flatten() {
            let p = entry.path();
            if p.file_stem().map(|s| s == task_id).unwrap_or(false) {
                return Some(p);
            }
        }
    }
    None
}
