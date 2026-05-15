import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { VideoInfo, DownloadOptions } from '../types/video.types'

// All commands live under the `video-downloader` Tauri plugin.
const ns = (cmd: string) => `plugin:video-downloader|${cmd}`

export function fetchVideoInfo(url: string, _signal?: AbortSignal) {
    return invoke<VideoInfo>(ns('video_info'), { url })
}

export interface DownloadProgress {
    task_id: string
    status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled'
    progress: number
    speed: string
    eta: string
    file_size: number
    filename?: string
    filepath?: string
    error?: string
}

/**
 * Starts a download. Returns a Promise that resolves when the download
 * terminates (completed / failed / cancelled). Progress events are pushed
 * to `onProgress` via the `video-progress` Tauri event.
 *
 * `signal` (if provided) cancels the running yt-dlp child process when aborted.
 */
export async function startDownload(
    options: DownloadOptions,
    onProgress: (data: DownloadProgress) => void,
    signal?: AbortSignal,
): Promise<void> {
    const taskId = await invoke<string>(ns('video_download_start'), {
        args: {
            url: options.url,
            format_id: options.format_id,
            output_type: options.output_type,
        },
    })

    let unlisten: UnlistenFn | undefined
    const abortHandler = () => {
        invoke(ns('video_download_cancel'), { taskId }).catch(() => {})
    }
    if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true })
    }

    return new Promise<void>((resolve) => {
        listen<DownloadProgress>('video-progress', (event) => {
            if (event.payload.task_id !== taskId) return
            onProgress(event.payload)
            if (['completed', 'failed', 'cancelled'].includes(event.payload.status)) {
                if (unlisten) unlisten()
                if (signal) signal.removeEventListener('abort', abortHandler)
                resolve()
            }
        }).then((fn) => {
            unlisten = fn
        })
    })
}

/** Read the downloaded file bytes back to the renderer (e.g. to save via dialog). */
export async function readDownloadedFile(taskId: string): Promise<Uint8Array> {
    const arr = await invoke<number[]>(ns('video_download_read'), { taskId })
    return new Uint8Array(arr)
}

export async function cancelDownload(taskId: string) {
    await invoke(ns('video_download_cancel'), { taskId })
}

export async function cleanupTask(taskId: string) {
    await invoke(ns('video_download_cleanup'), { taskId })
}

// Kept for callsites that expect a URL — not applicable in Tauri.
// Use `readDownloadedFile(taskId)` + save dialog instead.
export function getDownloadFileUrl(_taskId: string): string {
    return ''
}
