// Bridge to the `video-downloader` plugin for the Images workflow.
// Progress is streamed over the `media-image-progress` window event.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ImageBatchProgress, ImageProbeResult, ImageProcessArgs } from '../types'

const ns = (cmd: string) => `plugin:video-downloader|${cmd}`

export const IMAGE_PROGRESS_EVENT = 'media-image-progress'

export function probeImages(paths: string[]) {
  return invoke<ImageProbeResult[]>(ns('media_image_probe'), { paths })
}

export async function readImageBytes(path: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>(ns('media_image_read_bytes'), { path })
  return new Uint8Array(arr)
}

export async function listenImageProgress(
  onProgress: (data: ImageBatchProgress) => void,
): Promise<UnlistenFn> {
  return listen<ImageBatchProgress>(IMAGE_PROGRESS_EVENT, (event) => onProgress(event.payload))
}

export function startImageProcess(args: ImageProcessArgs) {
  return invoke<string>(ns('media_image_process_start'), { args })
}

export function cancelImageProcess(taskId: string) {
  return invoke<void>(ns('media_image_process_cancel'), { taskId })
}

export function cleanupImageTask(taskId: string) {
  return invoke<void>(ns('media_image_process_cleanup'), { taskId })
}
