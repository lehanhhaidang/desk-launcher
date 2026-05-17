// Cross-feature types. Each feature owns its own internal types; this file
// holds shapes that the queue/store needs to know about so it can aggregate
// jobs from Capture, Images, and Videos under one model.

export type MediaJobKind = 'capture' | 'image' | 'video'

export type MediaJobStatus =
  | 'queued'
  | 'running'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface MediaJob {
  /** Backend task id — used to cancel/cleanup. */
  id: string
  kind: MediaJobKind
  /** Short, user-facing label (filename or capture title). */
  label: string
  status: MediaJobStatus
  /** 0..100. Indeterminate phases (e.g. ffmpeg muxing) can sit at the last seen value. */
  progress: number
  /** One-line detail like "1.2 MB/s · ETA 4s" or "5/12 files". */
  detail?: string
  /** Absolute output path once completed. */
  output?: string
  outputName?: string
  /** Human-readable error message when status === 'failed'. */
  error?: string
  createdAt: number
  updatedAt: number
}
