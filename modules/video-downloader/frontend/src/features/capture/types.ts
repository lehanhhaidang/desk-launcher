export interface VideoFormat {
  format_id: string
  ext: string
  resolution: string | null
  fps: number | null
  vcodec: string | null
  acodec: string | null
  filesize: number | null
  filesize_approx: number | null
  tbr: number | null
  abr: number | null
  note: string | null
  has_video: boolean
  has_audio: boolean
}

export interface VideoInfo {
  title: string
  thumbnail: string | null
  duration: number | null
  duration_string: string | null
  channel: string | null
  view_count: number | null
  upload_date: string | null
  video_formats: VideoFormat[]
  audio_formats: VideoFormat[]
}

export type CaptureOutput = 'mp4' | 'mp3'

export interface CaptureDownloadOptions {
  url: string
  format_id: string
  output_type: CaptureOutput
}

export interface PlatformInfo {
  id: string
  name: string
  icon: string
  color: string
}
