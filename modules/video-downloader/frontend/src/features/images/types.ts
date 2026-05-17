export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'

export interface ImageProbeResult {
  path: string
  ok: boolean
  width: number
  height: number
  format: string
  size: number
  error?: string
}

export interface ImageOutputSettings {
  format: ImageOutputFormat
  /** 1..100 — used for jpeg / webp encoders. */
  quality: number
  resize_width: number | null
  resize_height: number | null
  preserve_aspect_ratio: boolean
  /** Allowed tokens: {name}, {index}, {format}, {width}, {height}. */
  naming_pattern: string
}

/** Crop region in the source image's natural pixel coordinates. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageJobInput {
  path: string
  crop: CropRect | null
}

export interface ImageProcessArgs {
  files: ImageJobInput[]
  output: ImageOutputSettings
}

export interface ImageBatchProgress {
  task_id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  total: number
  done: number
  failed: number
  current_file?: string
  message?: string
  output_dir?: string
  error?: string
}

/** Frontend view-model — combines the input probe with per-file status. */
export interface ImageEntry {
  id: string
  path: string
  name: string
  size: number
  width: number
  height: number
  format: string
  status: 'pending' | 'running' | 'done' | 'failed'
  error?: string
  /** Optional per-image crop rectangle in natural pixel coordinates. */
  crop?: CropRect
}

export const SUPPORTED_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
] as const
