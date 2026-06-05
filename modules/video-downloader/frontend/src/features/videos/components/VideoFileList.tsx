import { Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui'
import { formatDuration, formatFileSize } from '../../../shared/format'
import type { VideoEntry } from '../types'

interface VideoFileListProps {
  entries: VideoEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

const STATUS_LABEL: Record<VideoEntry['status'], string> = {
  pending: 'Ready',
  running: 'Processing',
  done: 'Done',
  failed: 'Error',
}

const STATUS_CLASS: Record<VideoEntry['status'], string> = {
  pending: 'vd-status-pill vd-status-pill-muted',
  running: 'vd-status-pill vd-status-pill-info',
  done: 'vd-status-pill vd-status-pill-success',
  failed: 'vd-status-pill vd-status-pill-danger',
}

export function VideoFileList({
  entries,
  selectedId,
  onSelect,
  onRemove,
  disabled,
}: VideoFileListProps) {
  if (entries.length === 0) {
    return (
      <div className="vd-empty-row">
        <p>No videos selected. Drop a file above or use Choose files.</p>
      </div>
    )
  }

  return (
    <div className="vd-file-list">
      <div className="vd-file-row vd-file-row-head vd-video-row">
        <span>File</span>
        <span>Duration</span>
        <span>Resolution</span>
        <span>Size</span>
        <span>Status</span>
        <span aria-hidden />
      </div>
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.id}
          className="vd-file-row vd-video-row"
          data-active={entry.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(entry.id)}
        >
          <span className="min-w-0 truncate text-left" title={entry.path}>
            {entry.name}
          </span>
          <span className="vd-muted">{formatDuration(entry.duration)}</span>
          <span className="vd-muted">
            {entry.width > 0 ? `${entry.width} × ${entry.height}` : '—'}
          </span>
          <span className="vd-muted">{formatFileSize(entry.size)}</span>
          <span className={STATUS_CLASS[entry.status]}>{STATUS_LABEL[entry.status]}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(entry.id)
            }}
            aria-label={`Remove ${entry.name}`}
            className="vd-ghost-button"
          >
            <Trash2 className="size-4" />
          </Button>
        </button>
      ))}
    </div>
  )
}
