// Bridge to the `video-downloader` plugin for the Videos workflow.
// Progress is streamed over the `media-video-progress` window event.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  VideoFileProbe,
  VideoProcessArgs,
  VideoProcessProgress,
} from '../types'

const ns = (cmd: string) => `plugin:video-downloader|${cmd}`

export const VIDEO_PROGRESS_EVENT = 'media-video-progress'

export function probeVideos(paths: string[]) {
  return invoke<VideoFileProbe[]>(ns('media_video_probe'), { paths })
}

export async function listenVideoProgress(
  onProgress: (data: VideoProcessProgress) => void,
): Promise<UnlistenFn> {
  return listen<VideoProcessProgress>(VIDEO_PROGRESS_EVENT, (event) => onProgress(event.payload))
}

export function startVideoProcess(args: VideoProcessArgs) {
  return invoke<string>(ns('media_video_process_start'), { args })
}

export function cancelVideoProcess(taskId: string) {
  return invoke<void>(ns('media_video_process_cancel'), { taskId })
}

export function cleanupVideoTask(taskId: string) {
  return invoke<void>(ns('media_video_process_cleanup'), { taskId })
}
