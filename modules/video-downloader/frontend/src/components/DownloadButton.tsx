import { Button } from '@desk-launcher/ui'
import { LoadingSpinner } from '@desk-launcher/ui'
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
  // === IDLE ===
  if (downloadState.type === 'idle') {
    const label = outputType === 'mp3' ? 'Download MP3' : 'Download MP4'
    const icon = outputType === 'mp3' ? '🎵' : '🎬'

    return (
      <Button
        size="lg"
        disabled={disabled}
        onClick={onStart}
        className="h-14 w-full gap-3 text-lg font-semibold bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 shadow-lg shadow-red-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-red-500/30"
      >
        {icon} {label}
      </Button>
    )
  }

  // === DOWNLOADING / PROCESSING ===
  if (downloadState.type === 'downloading') {
    const { progress } = downloadState
    const isProcessing = progress.status === 'processing'
    const pct = Math.min(progress.progress, 100)

    return (
      <div className="space-y-3">
        {/* Progress bar */}
        <div className="relative h-12 w-full overflow-hidden rounded-lg bg-muted/50">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-sm font-medium">
            {isProcessing ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Merging / Converting...</span>
              </>
            ) : (
              <>
                <span>{pct.toFixed(0)}%</span>
                {progress.speed && <span className="text-muted-foreground">• {progress.speed}</span>}
                {progress.eta && <span className="text-muted-foreground">• ETA {progress.eta}</span>}
              </>
            )}
          </div>
        </div>

        {/* Cancel button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          ✕ Cancel Download
        </Button>
      </div>
    )
  }

  // === COMPLETED ===
  if (downloadState.type === 'completed') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-center text-sm text-green-400">
          ✅ Ready! {downloadState.filename} ({formatFileSize(downloadState.fileSize)})
        </div>
        <Button
          size="lg"
          onClick={onSave}
          className="h-14 w-full gap-3 text-lg font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30"
        >
          💾 Save to Computer
        </Button>
      </div>
    )
  }

  // === ERROR ===
  if (downloadState.type === 'error') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-400">
          ⚠️ {downloadState.message}
        </div>
        <Button
          size="lg"
          disabled={disabled}
          onClick={onStart}
          className="h-14 w-full gap-3 text-lg font-semibold bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
        >
          🔄 Retry
        </Button>
      </div>
    )
  }

  return null
}
