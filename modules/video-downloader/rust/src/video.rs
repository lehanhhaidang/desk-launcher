//! Videos workflow — local video processing through the ffmpeg sidecar.
//!
//! Each `media_video_process_start` call spawns one ffmpeg child with the
//! `-progress pipe:1` flag so we can stream `out_time_ms` updates to the
//! frontend without parsing stderr. Probe is a separate, short-lived ffmpeg
//! invocation that reads stream metadata from stderr.
//!
//! Commands:
//!   - `media_video_probe`            inspect local files
//!   - `media_video_process_start`    spawn ffmpeg; returns task_id
//!   - `media_video_process_cancel`   kill the ffmpeg child
//!   - `media_video_process_cleanup`  delete the output directory

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::events;
use crate::paths;
use crate::state::{VideoState, VideoTaskHandle};

const SIDECAR: &str = "ffmpeg";

// ──────────────────────────────── public types ────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoFileProbe {
    pub path: String,
    pub ok: bool,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub bitrate: Option<i64>,
    pub size: u64,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
pub enum VideoAction {
    Convert,
    Compress,
    ExtractAudio,
    Trim,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoTrim {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoProcessSettings {
    pub action: VideoAction,
    pub container: String, // mp4 | webm | mov
    pub audio_container: String, // mp3 | m4a | wav
    pub compression: String, // high-quality | balanced | small
    pub trim: VideoTrim,
}

#[derive(Debug, Deserialize)]
pub struct VideoProcessArgs {
    pub path: String,
    pub settings: VideoProcessSettings,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct VideoProcessProgress {
    pub task_id: String,
    /// "running" | "completed" | "failed" | "cancelled"
    pub status: String,
    pub progress: f32,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub message: Option<String>,
    pub output_path: Option<String>,
    pub output_name: Option<String>,
    pub error: Option<String>,
}

// ────────────────────────────────── commands ──────────────────────────────────

#[tauri::command]
pub async fn media_video_probe(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<VideoFileProbe>, String> {
    let mut results = Vec::with_capacity(paths.len());
    for path in paths {
        results.push(probe_one(&app, path).await);
    }
    Ok(results)
}

#[tauri::command]
pub async fn media_video_process_start(
    app: AppHandle,
    args: VideoProcessArgs,
) -> Result<String, String> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let output_dir = paths::video_task_dir(&task_id)?;

    let input = Path::new(&args.path);
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output")
        .to_string();

    let probe = single_probe(&app, &args.path).await;
    let duration = probe.as_ref().map(|p| p.duration).unwrap_or(0.0);

    let plan = build_command(&args.path, &args.settings, &stem, &output_dir)?;
    let output_path = plan.output_path.clone();

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR)
        .map_err(|e| format!("ffmpeg sidecar: {e}"))?
        .args(plan.args.clone())
        .spawn()
        .map_err(|e| format!("ffmpeg spawn: {e}"))?;

    {
        let state = app.state::<VideoState>();
        state.tasks.lock().unwrap().insert(
            task_id.clone(),
            VideoTaskHandle {
                child: Some(child),
                output_dir: output_dir.clone(),
                cancelled: false,
            },
        );
    }

    let app_bg = app.clone();
    let task_id_bg = task_id.clone();
    tokio::spawn(async move {
        run_progress_loop(app_bg, task_id_bg, &mut rx, duration, output_path).await;
    });

    Ok(task_id)
}

#[tauri::command]
pub fn media_video_process_cancel(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<VideoState>();
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
pub fn media_video_process_cleanup(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<VideoState>();
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(handle) = tasks.remove(&task_id) {
        let _ = std::fs::remove_dir_all(handle.output_dir);
    }
    Ok(())
}

// ──────────────────────────────── progress loop ────────────────────────────────

async fn run_progress_loop(
    app: AppHandle,
    task_id: String,
    rx: &mut tauri::async_runtime::Receiver<CommandEvent>,
    duration: f64,
    output_path: PathBuf,
) {
    let mut last_pct: f32 = 0.0;
    let mut last_speed: Option<String> = None;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line);
                for raw in text.lines() {
                    if let Some((key, value)) = raw.split_once('=') {
                        match key.trim() {
                            "out_time_ms" => {
                                if duration > 0.0 {
                                    let micros: f64 = value.trim().parse().unwrap_or(0.0);
                                    let seconds = micros / 1_000_000.0;
                                    let pct = ((seconds / duration) * 100.0).clamp(0.0, 100.0) as f32;
                                    if pct > last_pct {
                                        last_pct = pct;
                                    }
                                    emit(
                                        &app,
                                        VideoProcessProgress {
                                            task_id: task_id.clone(),
                                            status: "running".into(),
                                            progress: last_pct,
                                            speed: last_speed.clone(),
                                            eta: estimate_eta(seconds, duration),
                                            message: None,
                                            output_path: None,
                                            output_name: None,
                                            error: None,
                                        },
                                    );
                                }
                            }
                            "speed" => {
                                let trimmed = value.trim();
                                if !trimmed.is_empty() && trimmed != "N/A" {
                                    last_speed = Some(trimmed.to_string());
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            CommandEvent::Stderr(_) => { /* ffmpeg logs verbose status here; ignore */ }
            CommandEvent::Terminated(payload) => {
                let cancelled = {
                    let state = app.state::<VideoState>();
                    let guard = state.tasks.lock().unwrap();
                    guard.get(&task_id).map(|t| t.cancelled).unwrap_or(false)
                };
                let success = payload.code.unwrap_or(-1) == 0;

                let final_payload = if cancelled {
                    // Remove partial output, if any.
                    let _ = std::fs::remove_file(&output_path);
                    VideoProcessProgress {
                        task_id: task_id.clone(),
                        status: "cancelled".into(),
                        progress: last_pct,
                        speed: None,
                        eta: None,
                        message: Some("Cancelled".into()),
                        output_path: None,
                        output_name: None,
                        error: None,
                    }
                } else if success && output_path.exists() {
                    let name = output_path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string());
                    VideoProcessProgress {
                        task_id: task_id.clone(),
                        status: "completed".into(),
                        progress: 100.0,
                        speed: None,
                        eta: None,
                        message: None,
                        output_path: Some(output_path.display().to_string()),
                        output_name: name,
                        error: None,
                    }
                } else {
                    let _ = std::fs::remove_file(&output_path);
                    VideoProcessProgress {
                        task_id: task_id.clone(),
                        status: "failed".into(),
                        progress: last_pct,
                        speed: None,
                        eta: None,
                        message: None,
                        output_path: None,
                        output_name: None,
                        error: Some(format!("ffmpeg exit code {:?}", payload.code)),
                    }
                };

                emit(&app, final_payload);
                break;
            }
            _ => {}
        }
    }
}

fn emit(app: &AppHandle, payload: VideoProcessProgress) {
    let _ = app.emit(events::VIDEO_PROGRESS, payload);
}

fn estimate_eta(processed_seconds: f64, total: f64) -> Option<String> {
    if total <= 0.0 || processed_seconds <= 0.0 {
        return None;
    }
    let remaining = (total - processed_seconds).max(0.0);
    if remaining <= 0.0 {
        return None;
    }
    let s = remaining as i64;
    if s >= 3600 {
        Some(format!("{}h {}m", s / 3600, (s % 3600) / 60))
    } else if s >= 60 {
        Some(format!("{}m {}s", s / 60, s % 60))
    } else {
        Some(format!("{}s", s))
    }
}

// ──────────────────────────────── ffmpeg command planner ────────────────────────────────

struct FfmpegPlan {
    args: Vec<String>,
    output_path: PathBuf,
}

fn build_command(
    input: &str,
    settings: &VideoProcessSettings,
    stem: &str,
    output_dir: &Path,
) -> Result<FfmpegPlan, String> {
    let mut args: Vec<String> = Vec::new();
    args.extend([
        "-hide_banner".into(),
        "-y".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ]);

    let mut output_ext = settings.container.clone();
    let mut suffix = String::new();

    match settings.action {
        VideoAction::Convert => {
            args.extend(["-i".into(), input.to_string(), "-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
            suffix.push_str("-converted");
        }
        VideoAction::Compress => {
            let (crf, preset) = preset_to_crf(&settings.compression);
            args.extend([
                "-i".into(),
                input.to_string(),
                "-c:v".into(),
                "libx264".into(),
                "-crf".into(),
                crf.to_string(),
                "-preset".into(),
                preset.into(),
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "128k".into(),
            ]);
            suffix.push_str("-compressed");
        }
        VideoAction::ExtractAudio => {
            args.extend(["-i".into(), input.to_string(), "-vn".into()]);
            match settings.audio_container.as_str() {
                "mp3" => args.extend(["-c:a".into(), "libmp3lame".into(), "-q:a".into(), "2".into()]),
                "m4a" => args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]),
                "wav" => args.extend(["-c:a".into(), "pcm_s16le".into()]),
                other => return Err(format!("unsupported audio container: {other}")),
            }
            output_ext = settings.audio_container.clone();
            suffix.push_str("-audio");
        }
        VideoAction::Trim => {
            if settings.trim.start.trim().is_empty() {
                return Err("Trim requires a start time".into());
            }
            args.extend(["-i".into(), input.to_string(), "-ss".into(), settings.trim.start.clone()]);
            if !settings.trim.end.trim().is_empty() {
                args.extend(["-to".into(), settings.trim.end.clone()]);
            }
            args.extend(["-c".into(), "copy".into()]);
            suffix.push_str("-trim");
        }
    }

    let filename = sanitize_filename(&format!("{stem}{suffix}.{output_ext}"));
    let output_path = unique_output(output_dir, &filename, &output_ext);
    args.push(output_path.to_string_lossy().to_string());

    Ok(FfmpegPlan { args, output_path })
}

fn preset_to_crf(preset: &str) -> (u8, &'static str) {
    match preset {
        "high-quality" => (20, "slow"),
        "small" => (30, "veryfast"),
        _ => (24, "medium"),
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other if other.is_control() => '_',
            other => other,
        })
        .collect()
}

fn unique_output(dir: &Path, filename: &str, ext: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output")
        .to_string();
    for i in 1..1024 {
        let candidate = dir.join(format!("{stem} ({i}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(filename)
}

// ──────────────────────────────── probe ────────────────────────────────

async fn probe_one(app: &AppHandle, path: String) -> VideoFileProbe {
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    match single_probe(app, &path).await {
        Some(mut probe) => {
            probe.size = size;
            probe
        }
        None => VideoFileProbe {
            path,
            ok: false,
            width: 0,
            height: 0,
            duration: 0.0,
            fps: None,
            vcodec: None,
            acodec: None,
            bitrate: None,
            size,
            error: Some("ffmpeg probe failed".into()),
        },
    }
}

async fn single_probe(app: &AppHandle, path: &str) -> Option<VideoFileProbe> {
    let cmd = app
        .shell()
        .sidecar(SIDECAR)
        .ok()?
        .args(["-hide_banner", "-i", path]);
    let output = cmd.output().await.ok()?;
    // ffmpeg writes the input header to stderr and exits with code 1 when no
    // output is specified — that's expected; we only care about the stderr text.
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Some(parse_probe(path, stderr))
}

fn parse_probe(path: &str, stderr: String) -> VideoFileProbe {
    let mut probe = VideoFileProbe {
        path: path.to_string(),
        ok: false,
        width: 0,
        height: 0,
        duration: 0.0,
        fps: None,
        vcodec: None,
        acodec: None,
        bitrate: None,
        size: 0,
        error: None,
    };

    for line in stderr.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Duration:") {
            if let Some((duration_str, after)) = rest.trim().split_once(',') {
                probe.duration = parse_hms(duration_str.trim()).unwrap_or(0.0);
                if let Some(br_part) = after.split("bitrate:").nth(1) {
                    let br_text = br_part.trim().trim_end_matches("kb/s").trim();
                    if let Ok(kb) = br_text.parse::<i64>() {
                        probe.bitrate = Some(kb * 1000);
                    }
                }
            }
        } else if line.contains("Video:") {
            probe.vcodec = extract_codec(line, "Video:");
            if let Some((w, h)) = extract_resolution(line) {
                probe.width = w;
                probe.height = h;
            }
            probe.fps = extract_fps(line);
        } else if line.contains("Audio:") && probe.acodec.is_none() {
            probe.acodec = extract_codec(line, "Audio:");
        }
    }

    probe.ok = probe.duration > 0.0 || probe.width > 0 || probe.acodec.is_some();
    if !probe.ok {
        probe.error = Some("Unable to parse ffmpeg output".into());
    }
    probe
}

fn parse_hms(input: &str) -> Option<f64> {
    let parts: Vec<&str> = input.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn extract_codec(line: &str, key: &str) -> Option<String> {
    let after = line.split(key).nth(1)?;
    let codec = after
        .trim()
        .split(|c: char| c == ',' || c == '(')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if codec.is_empty() {
        None
    } else {
        Some(codec)
    }
}

fn extract_resolution(line: &str) -> Option<(u32, u32)> {
    for segment in line.split(',') {
        let segment = segment.trim();
        let candidate = segment.split_whitespace().next().unwrap_or("");
        if let Some((w, h)) = candidate.split_once('x') {
            let w_ok = w.chars().all(|c| c.is_ascii_digit());
            let h_part = h
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>();
            let h_ok = !h_part.is_empty();
            if w_ok && h_ok {
                return Some((w.parse().ok()?, h_part.parse().ok()?));
            }
        }
    }
    None
}

fn extract_fps(line: &str) -> Option<f64> {
    for segment in line.split(',') {
        let segment = segment.trim();
        if let Some(idx) = segment.find(" fps") {
            let value = &segment[..idx];
            if let Ok(parsed) = value.trim().parse::<f64>() {
                return Some(parsed);
            }
        }
    }
    None
}
