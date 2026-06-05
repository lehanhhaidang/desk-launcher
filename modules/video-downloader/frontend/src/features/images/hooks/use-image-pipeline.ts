// Single source of truth for the Images tab.
//
// Owns the inbox of selected files, fires the backend `probe` command when
// new files arrive, and orchestrates the batch process flow. The hook reports
// progress into the shared job store so the Queue tab can observe the same
// run without extra plumbing.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelImageProcess,
  listenImageProgress,
  probeImages,
  startImageProcess,
} from '../api/images-api'
import type {
  CropRect,
  ImageBatchProgress,
  ImageEntry,
  ImageOutputSettings,
  ImageProbeResult,
} from '../types'
import { useJobStore } from '../../queue/job-store'
import { basename } from '../../../shared/format'

const DEFAULT_SETTINGS: ImageOutputSettings = {
  format: 'webp',
  quality: 85,
  resize_width: null,
  resize_height: null,
  preserve_aspect_ratio: true,
  naming_pattern: '{name}',
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; taskId: string; total: number; done: number; failed: number }
  | { kind: 'done'; taskId: string; outputDir: string; done: number; failed: number; total: number }
  | { kind: 'error'; message: string }

function makeId(path: string, idx: number): string {
  return `${idx}-${path}`
}

function fromProbe(probe: ImageProbeResult, idx: number): ImageEntry {
  return {
    id: makeId(probe.path, idx),
    path: probe.path,
    name: basename(probe.path),
    width: probe.width,
    height: probe.height,
    format: probe.format,
    size: probe.size,
    status: probe.ok ? 'pending' : 'failed',
    error: probe.ok ? undefined : probe.error,
  }
}

export function useImagePipeline() {
  const [entries, setEntries] = useState<ImageEntry[]>([])
  const [settings, setSettings] = useState<ImageOutputSettings>(DEFAULT_SETTINGS)
  const [run, setRun] = useState<RunState>({ kind: 'idle' })
  const [probeError, setProbeError] = useState<string | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const upsertJob = useJobStore((s) => s.upsert)
  const patchJob = useJobStore((s) => s.patch)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    listenImageProgress((data) => {
      if (disposed) return
      handleProgress(data)
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    return () => {
      disposed = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleProgress = useCallback(
    (data: ImageBatchProgress) => {
      if (taskIdRef.current !== data.task_id) return

      const progressPct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
      const detail = `${data.done}/${data.total} files`

      if (data.status === 'running') {
        setRun({
          kind: 'running',
          taskId: data.task_id,
          total: data.total,
          done: data.done,
          failed: data.failed,
        })
        patchJob(data.task_id, { status: 'running', progress: progressPct, detail })
        if (data.current_file) {
          setEntries((prev) =>
            prev.map((entry) =>
              entry.path === data.current_file && entry.status === 'pending'
                ? { ...entry, status: 'running' }
                : entry,
            ),
          )
        }
        return
      }

      if (data.status === 'completed') {
        setRun({
          kind: 'done',
          taskId: data.task_id,
          outputDir: data.output_dir ?? '',
          done: data.done,
          failed: data.failed,
          total: data.total,
        })
        patchJob(data.task_id, {
          status: 'completed',
          progress: 100,
          detail: `${data.done} ok · ${data.failed} failed`,
          output: data.output_dir,
        })
        setEntries((prev) =>
          prev.map((entry) =>
            entry.status === 'running' || entry.status === 'pending'
              ? { ...entry, status: 'done' }
              : entry,
          ),
        )
        taskIdRef.current = null
      } else if (data.status === 'failed') {
        setRun({ kind: 'error', message: data.error || data.message || 'Image batch failed' })
        patchJob(data.task_id, {
          status: 'failed',
          error: data.error || data.message,
          detail,
        })
        taskIdRef.current = null
      } else if (data.status === 'cancelled') {
        setRun({ kind: 'idle' })
        patchJob(data.task_id, { status: 'cancelled', detail })
        setEntries((prev) =>
          prev.map((entry) =>
            entry.status === 'running' ? { ...entry, status: 'pending' } : entry,
          ),
        )
        taskIdRef.current = null
      }
    },
    [patchJob],
  )

  const addFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setProbeError(null)
    try {
      const probes = await probeImages(paths)
      setEntries((prev) => {
        const known = new Set(prev.map((e) => e.path))
        const fresh = probes
          .filter((p) => !known.has(p.path))
          .map((p, idx) => fromProbe(p, prev.length + idx))
        return [...prev, ...fresh]
      })
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'Failed to read images')
    }
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }, [])

  const setCrop = useCallback((id: string, crop: CropRect | null) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry
        if (crop) return { ...entry, crop }
        const { crop: _omit, ...rest } = entry
        return rest
      }),
    )
  }, [])

  const clear = useCallback(() => {
    if (run.kind === 'running') return
    setEntries([])
    setRun({ kind: 'idle' })
  }, [run.kind])

  const start = useCallback(async () => {
    const ready = entries.filter((entry) => entry.status !== 'failed')
    if (ready.length === 0) return

    setRun({ kind: 'running', taskId: '', total: ready.length, done: 0, failed: 0 })
    setEntries((prev) =>
      prev.map((entry) => (entry.status === 'failed' ? entry : { ...entry, status: 'pending' })),
    )

    try {
      const taskId = await startImageProcess({
        files: ready.map((entry) => ({ path: entry.path, crop: entry.crop ?? null })),
        output: settings,
      })
      taskIdRef.current = taskId
      upsertJob({
        id: taskId,
        kind: 'image',
        label: `Images (${ready.length})`,
        status: 'running',
        progress: 0,
        detail: `0/${ready.length} files`,
      })
      setRun({ kind: 'running', taskId, total: ready.length, done: 0, failed: 0 })
    } catch (err) {
      setRun({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to start' })
    }
  }, [entries, settings, upsertJob])

  const cancel = useCallback(async () => {
    const taskId = taskIdRef.current
    if (!taskId) return
    try {
      await cancelImageProcess(taskId)
    } catch {
      // Backend may have already completed — ignore.
    }
  }, [])

  return {
    entries,
    settings,
    setSettings,
    run,
    probeError,
    addFiles,
    removeEntry,
    setCrop,
    clear,
    start,
    cancel,
  }
}
