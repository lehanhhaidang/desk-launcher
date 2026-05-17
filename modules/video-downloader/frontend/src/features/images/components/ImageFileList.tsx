import { Crop, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui'
import { formatFileSize } from '../../../shared/format'
import type { ImageEntry } from '../types'

interface ImageFileListProps {
  entries: ImageEntry[]
  onRemove: (id: string) => void
  onEditCrop: (id: string) => void
  disabled?: boolean
}

const STATUS_LABEL: Record<ImageEntry['status'], string> = {
  pending: 'Queued',
  running: 'Processing',
  done: 'Done',
  failed: 'Error',
}

const STATUS_CLASS: Record<ImageEntry['status'], string> = {
  pending: 'vd-status-pill vd-status-pill-muted',
  running: 'vd-status-pill vd-status-pill-info',
  done: 'vd-status-pill vd-status-pill-success',
  failed: 'vd-status-pill vd-status-pill-danger',
}

export function ImageFileList({ entries, onRemove, onEditCrop, disabled }: ImageFileListProps) {
  if (entries.length === 0) {
    return (
      <div className="vd-empty-row">
        <p>No images selected. Drop files above or use Choose files.</p>
      </div>
    )
  }

  return (
    <div className="vd-file-list">
      <div className="vd-file-row vd-image-row vd-file-row-head">
        <span>File</span>
        <span>Dimensions</span>
        <span>Crop</span>
        <span>Size</span>
        <span>Status</span>
        <span aria-hidden />
      </div>
      {entries.map((entry) => {
        const cropLabel = entry.crop
          ? `${entry.crop.width} × ${entry.crop.height}`
          : '—'
        return (
          <div className="vd-file-row vd-image-row" key={entry.id}>
            <span className="min-w-0 truncate" title={entry.path}>
              {entry.name}
            </span>
            <span className="vd-muted">
              {entry.width > 0 ? `${entry.width} × ${entry.height}` : '—'}
            </span>
            <button
              type="button"
              className="vd-crop-button"
              disabled={disabled || entry.status === 'failed'}
              onClick={() => onEditCrop(entry.id)}
              data-active={entry.crop ? 'true' : undefined}
              title={entry.crop ? 'Edit crop' : 'Add crop'}
            >
              <Crop className="size-3.5" />
              <span>{cropLabel}</span>
            </button>
            <span className="vd-muted">{formatFileSize(entry.size)}</span>
            <span className={STATUS_CLASS[entry.status]}>{STATUS_LABEL[entry.status]}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove ${entry.name}`}
              className="vd-ghost-button"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
