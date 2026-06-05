//! Per-feature task state.
//!
//! Each feature manages its own task table keyed by `task_id`. Keeping the
//! state types in one place makes it easy to see the shape of an in-flight
//! job at a glance and to add new fields without ranging across files.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri_plugin_shell::process::CommandChild;

/// Cancellation flag shared with worker threads.
pub type CancelFlag = Arc<AtomicBool>;

/// Capture (yt-dlp) tasks own a child process plus the output directory we
/// scan when the task terminates to find the produced file.
pub struct CaptureTaskHandle {
    pub child: Option<CommandChild>,
    pub output_dir: PathBuf,
    pub output_type: String,
    pub cancelled: bool,
}

#[derive(Default)]
pub struct CaptureState {
    pub tasks: Mutex<HashMap<String, CaptureTaskHandle>>,
}

/// Image batches don't shell out — they run inside a worker thread that owns
/// the `image` crate work. Cancellation is cooperative via an atomic flag.
pub struct ImageTaskHandle {
    pub cancelled: CancelFlag,
    pub output_dir: PathBuf,
}

#[derive(Default)]
pub struct ImageState {
    pub tasks: Mutex<HashMap<String, ImageTaskHandle>>,
}

/// Video processing spawns one ffmpeg child per task. `output_dir` is what
/// the `cleanup` command removes; the final file path is owned by the
/// progress-loop closure so cancellation can delete any partial output.
pub struct VideoTaskHandle {
    pub child: Option<CommandChild>,
    pub output_dir: PathBuf,
    pub cancelled: bool,
}

#[derive(Default)]
pub struct VideoState {
    pub tasks: Mutex<HashMap<String, VideoTaskHandle>>,
}
