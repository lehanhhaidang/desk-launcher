import { CheckCircle2, FolderOpen, Play, X } from 'lucide-react'
import { Button } from '../../../components/ui'
import { openPath, revealInFolder } from '../../../shared/reveal'

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; taskId: string; entryId: string; progress: number; detail?: string }
  | { kind: 'done'; taskId: string; entryId: string; output: string; outputName?: string }
  | { kind: 'error'; entryId: string; message: string }

interface VideoExportPanelProps {
  run: RunState
  canStart: boolean
  onStart: () => void
  onCancel: () => void
}

export type { RunState as VideoPipelineRunState }

export function VideoExportPanel({ run, canStart, onStart, onCancel }: VideoExportPanelProps) {
  if (run.kind === 'running') {
    const pct = Math.round(run.progress)
    return (
      <div className="vd-export-panel">
        <div className="relative h-10 w-full overflow-hidden rounded-lg border border-sky-200/10 bg-black/25">
          <div
            className="vd-progress absolute inset-y-0 left-0 transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex min-w-0 items-center justify-center gap-2 px-3 text-sm font-semibold text-[#eef6ff]">
            <span className="shrink-0">{pct}%</span>
            {run.detail && (
              <span className="min-w-0 truncate vd-subtle">- {run.detail}</span>
            )}
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
            <p className="font-medium truncate" title={run.outputName ?? ''}>
              {run.outputName ?? 'Exported'}
            </p>
            {run.output && (
              <p className="truncate vd-muted text-xs" title={run.output}>
                {run.output}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="vd-ghost-button h-10 gap-2"
            disabled={!run.output}
            onClick={() => run.output && revealInFolder(run.output).catch(() => {})}
          >
            <FolderOpen className="size-4" />
            <span>Reveal</span>
          </Button>
          <Button
            type="button"
            className="vd-primary-button h-10 gap-2"
            disabled={!run.output}
            onClick={() => run.output && openPath(run.output).catch(() => {})}
          >
            <Play className="size-4" />
            <span>Open file</span>
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="vd-ghost-button h-10 w-full gap-2"
          disabled={!canStart}
          onClick={onStart}
        >
          <Play className="size-4" />
          <span>Run again</span>
        </Button>
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
          disabled={!canStart}
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
      disabled={!canStart}
      onClick={onStart}
      className="vd-primary-button h-[44px] w-full gap-2 font-bold"
    >
      <Play className="size-5" />
      <span>Export video</span>
    </Button>
  )
}
