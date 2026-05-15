import { Button } from '@desk-launcher/ui'
import { LoadingSpinner } from '@desk-launcher/ui'
import { CheckCircle2, Download, RotateCcw, Save, X } from 'lucide-react'
import type { DownloadProgress } from '../api/video-api'

interface DownloadButtonProps {
  disabled: boolean
  downloadState: DownloadState
  outputType: string
  onStart: () => void
  onSave: () => void
  onCancel: () => void
}

export type DownloadState =
  | { type: 'idle' }
  | { type: 'downloading'; progress: DownloadProgress }
  | { type: 'completed'; taskId: string; filename: string; fileSize: number }
  | { type: 'error'; message: string }

function formatFileSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function DownloadButton({
  disabled,
  downloadState,
  outputType,
  onStart,
  onSave,
  onCancel,
}: DownloadButtonProps) {
  if (downloadState.type === 'idle') {
    const label = outputType === 'mp3' ? 'Download MP3' : 'Download MP4'

    return (
      <Button
        size="lg"
        disabled={disabled}
        onClick={onStart}
        className="vd-primary-button h-12 w-full gap-2 text-base font-semibold"
      >
        <Download className="size-5" />
        {label}
      </Button>
    )
  }

  if (downloadState.type === 'downloading') {
    const { progress } = downloadState
    const isProcessing = progress.status === 'processing'
    const pct = Math.min(progress.progress, 100)

    return (
      <div className="vd-panel space-y-3 rounded-xl p-3">
        <div className="relative h-10 w-full overflow-hidden rounded-lg border border-sky-200/10 bg-black/25">
          <div
            className="vd-progress absolute inset-y-0 left-0 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-sm font-semibold text-[#eef6ff]">
            {isProcessing ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Merging / Converting...</span>
              </>
            ) : (
              <>
                <span>{pct.toFixed(0)}%</span>
                {progress.speed && <span className="vd-subtle">- {progress.speed}</span>}
                {progress.eta && <span className="vd-subtle">- ETA {progress.eta}</span>}
              </>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="w-full border-red-300/25 bg-red-400/10 text-red-200 hover:bg-red-400/15 hover:text-red-100"
        >
          <X className="size-4" />
          Cancel Download
        </Button>
      </div>
    )
  }

  if (downloadState.type === 'completed') {
    return (
      <div className="vd-panel space-y-2 rounded-xl p-3">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-2.5 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1 break-words">
            <span className="font-medium">Ready:</span> {downloadState.filename}{' '}
            <span className="opacity-80">({formatFileSize(downloadState.fileSize)})</span>
          </div>
        </div>
        <Button
          size="lg"
          onClick={onSave}
          className="h-12 w-full gap-2 bg-emerald-300 text-[#07111f] text-base font-semibold hover:bg-emerald-200"
        >
          <Save className="size-5" />
          Save to Computer
        </Button>
      </div>
    )
  }

  if (downloadState.type === 'error') {
    return (
      <div className="vd-panel space-y-2 rounded-xl p-3">
        <div className="break-words rounded-lg border border-red-300/25 bg-red-400/10 p-2.5 text-sm text-red-200">
          {downloadState.message}
        </div>
        <Button
          size="lg"
          disabled={disabled}
          onClick={onStart}
          className="vd-primary-button h-12 w-full gap-2 text-base font-semibold"
        >
          <RotateCcw className="size-5" />
          Retry
        </Button>
      </div>
    )
  }

  return null
}
