// Queue tab — unified job timeline driven by the shared job store.
//
// The store is fed by each feature when it starts a backend task and is
// patched on every progress event. This tab is intentionally a thin view
// over that store with cancel / retry / reveal actions delegated by kind.

import { useMemo } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '../../components/ui'
import { SectionHeader } from '../../components/common/SectionHeader'
import { isJobTerminal, useJobStore } from './job-store'
import { QueueRow } from './components/QueueRow'
import type { MediaJob } from '../../shared/types'
import { cancelDownload } from '../capture/api/capture-api'
import { cancelImageProcess } from '../images/api/images-api'
import { cancelVideoProcess } from '../videos/api/videos-api'

async function cancelByKind(job: MediaJob): Promise<void> {
  try {
    if (job.kind === 'capture') await cancelDownload(job.id)
    else if (job.kind === 'image') await cancelImageProcess(job.id)
    else if (job.kind === 'video') await cancelVideoProcess(job.id)
  } catch {
    // The backend may have already terminated the task; ignore silently.
  }
}

export function QueueTab() {
  const jobs = useJobStore((s) => s.jobs)
  const remove = useJobStore((s) => s.remove)
  const clearFinished = useJobStore((s) => s.clearFinished)

  const { active, history, stats } = useMemo(() => {
    const activeJobs: MediaJob[] = []
    const historyJobs: MediaJob[] = []
    let completed = 0
    let failed = 0
    for (const job of jobs) {
      if (isJobTerminal(job.status)) {
        historyJobs.push(job)
        if (job.status === 'completed') completed += 1
        if (job.status === 'failed') failed += 1
      } else {
        activeJobs.push(job)
      }
    }
    return {
      active: activeJobs,
      history: historyJobs,
      stats: { active: activeJobs.length, completed, failed },
    }
  }, [jobs])

  const onCancel = (job: MediaJob) => {
    cancelByKind(job)
  }

  return (
    <div className="vd-feature-stack">
      <SectionHeader
        label="Queue"
        title="Media jobs"
        actions={
          history.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFinished}
              className="vd-ghost-button gap-2"
            >
              <Eraser className="size-4" />
              <span>Clear finished</span>
            </Button>
          ) : null
        }
      />

      <div className="vd-queue-grid">
        <QueueMetric label="Active" value={stats.active} />
        <QueueMetric label="Completed" value={stats.completed} />
        <QueueMetric label="Failed" value={stats.failed} />
      </div>

      <QueueSection
        title="Active"
        emptyText="No jobs running. Start a download, image batch, or video export."
        jobs={active}
        onCancel={onCancel}
      />

      <QueueSection
        title="History"
        emptyText="Completed and failed jobs will land here."
        jobs={history}
        onRemove={(job) => remove(job.id)}
      />
    </div>
  )
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="vd-queue-metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

interface QueueSectionProps {
  title: string
  emptyText: string
  jobs: MediaJob[]
  onCancel?: (job: MediaJob) => void
  onRetry?: (job: MediaJob) => void
  onRemove?: (job: MediaJob) => void
}

function QueueSection({ title, emptyText, jobs, onCancel, onRetry, onRemove }: QueueSectionProps) {
  return (
    <div className="vd-queue-section">
      <h3 className="vd-queue-section-title">{title}</h3>
      {jobs.length === 0 ? (
        <div className="vd-empty-row">
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="vd-queue-list">
          {jobs.map((job) => (
            <QueueRow
              key={job.id}
              job={job}
              onCancel={onCancel}
              onRetry={onRetry}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
