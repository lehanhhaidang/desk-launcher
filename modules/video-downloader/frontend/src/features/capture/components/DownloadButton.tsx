import { CheckCircle2, Download, RotateCcw, Save, X } from 'lucide-react'
import { Button, LoadingSpinner } from '../../../components/ui'
import { formatFileSize } from '../../../shared/format'
import type { CaptureProgress } from '../api/capture-api'

export type DownloadState =
  | { type: 'idle' }
  | { type: 'downloading'; progress: CaptureProgress }
  | { type: 'completed'; taskId: string; filename: string; fileSize: number }
  | { type: 'error'; message: string }

interface DownloadButtonProps {
  disabled: boolean
  downloadState: DownloadState
  outputType: string
  onStart: () => void
  onSave: () => void
  onCancel: () => void
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
        className="vd-primary-button h-[52px] w-full min-w-0 gap-3 text-base font-bold"
      >
        <Download className="size-5 shrink-0" />
        <span className="truncate">{label}</span>
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
          <div className="absolute inset-0 flex min-w-0 items-center justify-center gap-2 px-3 text-sm font-semibold text-[#eef6ff]">
            {isProcessing ? (
              <>
                <LoadingSpinner size="sm" />
                <span className="truncate">Merging / Converting...</span>
              </>
            ) : (
              <>
                <span className="shrink-0">{pct.toFixed(0)}%</span>
                {progress.speed && <span className="min-w-0 truncate vd-subtle">- {progress.speed}</span>}
                {progress.eta && (
                  <span className="hidden min-w-0 truncate vd-subtle sm:inline">- ETA {progress.eta}</span>
                )}
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
          <X className="size-4 shrink-0" />
          <span className="truncate">Cancel Download</span>
        </Button>
      </div>
    )
  }

  if (downloadState.type === 'completed') {
    return (
      <div className="vd-panel space-y-2 rounded-xl p-3">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-2.5 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5">
              <span className="shrink-0 font-medium">Ready:</span>
              <span className="min-w-0 max-w-full truncate" title={downloadState.filename}>
                {downloadState.filename}
              </span>
              <span className="shrink-0 opacity-80">({formatFileSize(downloadState.fileSize)})</span>
            </div>
          </div>
        </div>
        <Button
          size="lg"
          onClick={onSave}
          className="vd-save-button h-[52px] w-full min-w-0 gap-3 text-base font-bold"
        >
          <Save className="size-5 shrink-0" />
          <span className="truncate">Save to Computer</span>
        </Button>
      </div>
    )
  }

  if (downloadState.type === 'error') {
    return (
      <div className="vd-panel space-y-2 rounded-xl p-3">
        <div className="min-w-0 whitespace-normal break-words rounded-lg border border-red-300/25 bg-red-400/10 p-2.5 text-sm text-red-200">
          {downloadState.message}
        </div>
        <Button
          size="lg"
          disabled={disabled}
          onClick={onStart}
          className="vd-primary-button h-[52px] w-full min-w-0 gap-3 text-base font-bold"
        >
          <RotateCcw className="size-5 shrink-0" />
          <span className="truncate">Retry</span>
        </Button>
      </div>
    )
  }

  return null
}
