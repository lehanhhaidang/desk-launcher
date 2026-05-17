import { CheckCircle2, FolderOpen, Play, X } from 'lucide-react'
import { Button } from '../../../components/ui'
import { revealInFolder } from '../../../shared/reveal'
import type { ImageBatchProgress } from '../types'

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; taskId: string; total: number; done: number; failed: number }
  | { kind: 'done'; taskId: string; outputDir: string; done: number; failed: number; total: number }
  | { kind: 'error'; message: string }

interface ImageExportPanelProps {
  run: RunState
  totalQueued: number
  onStart: () => void
  onCancel: () => void
}

function progressValue(run: RunState): number {
  if (run.kind === 'running' && run.total > 0) return Math.round((run.done / run.total) * 100)
  if (run.kind === 'done') return 100
  return 0
}

// Re-exported so callers can type-check against the same shape used by the hook.
export type { RunState as ImagePipelineRunState }
export type { ImageBatchProgress }

export function ImageExportPanel({ run, totalQueued, onStart, onCancel }: ImageExportPanelProps) {
  if (run.kind === 'running') {
    const pct = progressValue(run)
    return (
      <div className="vd-export-panel">
        <div className="relative h-10 w-full overflow-hidden rounded-lg border border-sky-200/10 bg-black/25">
          <div
            className="vd-progress absolute inset-y-0 left-0 transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#eef6ff]">
            {run.done}/{run.total} processed{run.failed > 0 && ` · ${run.failed} failed`}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="w-full border-red-300/25 bg-red-400/10 text-red-200 hover:bg-red-400/15"
        >
          <X className="size-4" />
          <span>Cancel</span>
        </Button>
      </div>
    )
  }

  if (run.kind === 'done') {
    return (
      <div className="vd-export-panel">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-2.5 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {run.done} exported{run.failed > 0 && ` · ${run.failed} failed`}
            </p>
            {run.outputDir && (
              <p className="truncate vd-muted text-xs" title={run.outputDir}>
                {run.outputDir}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="vd-ghost-button h-10 gap-2"
            disabled={!run.outputDir}
            onClick={() => run.outputDir && revealInFolder(run.outputDir).catch(() => {})}
          >
            <FolderOpen className="size-4" />
            <span>Open folder</span>
          </Button>
          <Button
            type="button"
            onClick={onStart}
            disabled={totalQueued === 0}
            className="vd-primary-button h-10 gap-2"
          >
            <Play className="size-4" />
            <span>Export again</span>
          </Button>
        </div>
      </div>
    )
  }

  if (run.kind === 'error') {
    return (
      <div className="vd-export-panel">
        <div className="rounded-lg border border-red-300/25 bg-red-400/10 p-2.5 text-sm text-red-200">
          {run.message}
        </div>
        <Button
          type="button"
          disabled={totalQueued === 0}
          onClick={onStart}
          className="vd-primary-button h-[44px] w-full gap-2 font-bold"
        >
          <Play className="size-4" />
          <span>Retry export</span>
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      disabled={totalQueued === 0}
      onClick={onStart}
      className="vd-primary-button h-[44px] w-full gap-2 font-bold"
    >
      <Play className="size-5" />
      <span>Export images</span>
    </Button>
  )
}
