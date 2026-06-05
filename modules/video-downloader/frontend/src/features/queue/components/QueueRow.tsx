import { Eraser, FolderOpen, RotateCcw, X } from 'lucide-react'
import { Button } from '../../../components/ui'
import { revealInFolder } from '../../../shared/reveal'
import { clampPercent } from '../../../shared/format'
import type { MediaJob } from '../../../shared/types'

interface QueueRowProps {
  job: MediaJob
  onCancel?: (job: MediaJob) => void
  onRetry?: (job: MediaJob) => void
  onRemove?: (job: MediaJob) => void
}

const KIND_LABEL: Record<MediaJob['kind'], string> = {
  capture: 'Capture',
  image: 'Image',
  video: 'Video',
}

const STATUS_CLASS: Record<MediaJob['status'], string> = {
  queued: 'vd-status-pill vd-status-pill-muted',
  running: 'vd-status-pill vd-status-pill-info',
  processing: 'vd-status-pill vd-status-pill-info',
  completed: 'vd-status-pill vd-status-pill-success',
  failed: 'vd-status-pill vd-status-pill-danger',
  cancelled: 'vd-status-pill vd-status-pill-muted',
}

export function QueueRow({ job, onCancel, onRetry, onRemove }: QueueRowProps) {
  const pct = clampPercent(job.progress)
  const isLive = job.status === 'running' || job.status === 'processing' || job.status === 'queued'

  return (
    <div className="vd-queue-row">
      <div className="vd-queue-meta">
        <p className="vd-queue-label" title={job.label}>{job.label}</p>
        <p className="vd-queue-detail">
          <span className="vd-queue-kind">{KIND_LABEL[job.kind]}</span>
          {job.detail && <span className="vd-muted"> · {job.detail}</span>}
          {job.error && <span className="vd-queue-error"> · {job.error}</span>}
        </p>
      </div>

      <div className="vd-queue-bar">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="absolute inset-y-0 left-0 vd-progress transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="vd-queue-percent">{pct.toFixed(0)}%</span>
      </div>

      <span className={STATUS_CLASS[job.status]}>{job.status}</span>

      <div className="vd-queue-actions">
        {isLive && onCancel && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="vd-ghost-button"
            aria-label="Cancel job"
            onClick={() => onCancel(job)}
          >
            <X className="size-4" />
          </Button>
        )}
        {job.status === 'failed' && onRetry && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="vd-ghost-button"
            aria-label="Retry job"
            onClick={() => onRetry(job)}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        {job.output && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="vd-ghost-button"
            aria-label="Reveal output"
            onClick={() => revealInFolder(job.output!).catch(() => {})}
          >
            <FolderOpen className="size-4" />
          </Button>
        )}
        {!isLive && onRemove && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="vd-ghost-button"
            aria-label="Remove job"
            onClick={() => onRemove(job)}
          >
            <Eraser className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
