export type VideoAction = 'convert' | 'compress' | 'extract-audio' | 'trim'

export type VideoContainer = 'mp4' | 'webm' | 'mov'

export type AudioContainer = 'mp3' | 'm4a' | 'wav'

export type CompressionPreset = 'high-quality' | 'balanced' | 'small'

export interface VideoTrim {
  start: string
  end: string
}

export interface VideoProcessSettings {
  action: VideoAction
  container: VideoContainer
  audio_container: AudioContainer
  compression: CompressionPreset
  trim: VideoTrim
}

export interface VideoFileProbe {
  path: string
  ok: boolean
  width: number
  height: number
  duration: number
  fps: number | null
  vcodec: string | null
  acodec: string | null
  bitrate: number | null
  size: number
  error?: string
}

export interface VideoProcessArgs {
  path: string
  settings: VideoProcessSettings
}

export interface VideoProcessProgress {
  task_id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  speed?: string
  eta?: string
  message?: string
  output_path?: string
  output_name?: string
  error?: string
}

export interface VideoEntry {
  id: string
  path: string
  name: string
  size: number
  width: number
  height: number
  duration: number
  fps: number | null
  vcodec: string | null
  acodec: string | null
  bitrate: number | null
  status: 'pending' | 'running' | 'done' | 'failed'
  error?: string
  output?: string
}

export const SUPPORTED_VIDEO_EXTENSIONS = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'm4v',
  'flv',
  'wmv',
] as const
