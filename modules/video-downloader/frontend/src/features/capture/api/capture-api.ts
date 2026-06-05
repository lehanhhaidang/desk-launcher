// Bridge to the `video-downloader` Tauri plugin for the Capture workflow.
// Backed by yt-dlp + ffmpeg sidecars; progress is streamed over the
// `video-progress` window event.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { CaptureDownloadOptions, VideoInfo } from '../types'

const ns = (cmd: string) => `plugin:video-downloader|${cmd}`

export const CAPTURE_PROGRESS_EVENT = 'video-progress'

export interface CaptureProgress {
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

export function fetchVideoInfo(url: string) {
  return invoke<VideoInfo>(ns('video_info'), { url })
}

/**
 * Start a download. Resolves when the task reaches a terminal status
 * (completed / failed / cancelled). Progress is pushed via `onProgress`.
 *
 * `signal` (optional) kills the underlying yt-dlp child process on abort.
 */
export async function startDownload(
  options: CaptureDownloadOptions,
  onProgress: (data: CaptureProgress) => void,
  signal?: AbortSignal,
  onTaskStart?: (taskId: string) => void,
): Promise<void> {
  let taskId = ''
  let unlisten: UnlistenFn | undefined

  const abortHandler = () => {
    if (!taskId) return
    invoke(ns('video_download_cancel'), { taskId }).catch(() => {})
  }

  if (signal) signal.addEventListener('abort', abortHandler, { once: true })

  let resolveFinished!: () => void
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  unlisten = await listen<CaptureProgress>(CAPTURE_PROGRESS_EVENT, (event) => {
    if (!taskId || event.payload.task_id !== taskId) return
    onProgress(event.payload)
    if (['completed', 'failed', 'cancelled'].includes(event.payload.status)) {
      unlisten?.()
      signal?.removeEventListener('abort', abortHandler)
      resolveFinished()
    }
  })

  try {
    taskId = await invoke<string>(ns('video_download_start'), {
      args: {
        url: options.url,
        format_id: options.format_id,
        output_type: options.output_type,
      },
    })
    onTaskStart?.(taskId)
    if (signal?.aborted) abortHandler()
    return await finished
  } catch (err) {
    unlisten?.()
    signal?.removeEventListener('abort', abortHandler)
    throw err
  }
}

export async function readDownloadedFile(taskId: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>(ns('video_download_read'), { taskId })
  return new Uint8Array(arr)
}

export async function cancelDownload(taskId: string): Promise<void> {
  await invoke(ns('video_download_cancel'), { taskId })
}

export async function cleanupCaptureTask(taskId: string): Promise<void> {
  await invoke(ns('video_download_cleanup'), { taskId })
}
