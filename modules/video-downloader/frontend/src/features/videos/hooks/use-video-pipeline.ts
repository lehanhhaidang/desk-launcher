// Hook driving the Videos tab.
//
// The Videos workflow processes one file at a time (ffmpeg is heavy on CPU
// and bandwidth, and batched UI can be added later). The hook holds the file
// list and tracks the currently-running ffmpeg job. Multi-select with a
// "process all sequentially" mode is left for a follow-up.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelVideoProcess,
  listenVideoProgress,
  probeVideos,
  startVideoProcess,
} from '../api/videos-api'
import type {
  VideoEntry,
  VideoFileProbe,
  VideoProcessProgress,
  VideoProcessSettings,
} from '../types'
import { basename, clampPercent } from '../../../shared/format'
import { useJobStore } from '../../queue/job-store'

const DEFAULT_SETTINGS: VideoProcessSettings = {
  action: 'convert',
  container: 'mp4',
  audio_container: 'mp3',
  compression: 'balanced',
  trim: { start: '', end: '' },
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; taskId: string; entryId: string; progress: number; detail?: string }
  | { kind: 'done'; taskId: string; entryId: string; output: string; outputName?: string }
  | { kind: 'error'; entryId: string; message: string }

function fromProbe(probe: VideoFileProbe, idx: number): VideoEntry {
  return {
    id: `${idx}-${probe.path}`,
    path: probe.path,
    name: basename(probe.path),
    size: probe.size,
    width: probe.width,
    height: probe.height,
    duration: probe.duration,
    fps: probe.fps,
    vcodec: probe.vcodec,
    acodec: probe.acodec,
    bitrate: probe.bitrate,
    status: probe.ok ? 'pending' : 'failed',
    error: probe.ok ? undefined : probe.error,
  }
}

export function useVideoPipeline() {
  const [entries, setEntries] = useState<VideoEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settings, setSettings] = useState<VideoProcessSettings>(DEFAULT_SETTINGS)
  const [run, setRun] = useState<RunState>({ kind: 'idle' })
  const [probeError, setProbeError] = useState<string | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const activeEntryRef = useRef<string | null>(null)
  const upsertJob = useJobStore((s) => s.upsert)
  const patchJob = useJobStore((s) => s.patch)

  const handleProgress = useCallback(
    (data: VideoProcessProgress) => {
      if (!data.task_id || taskIdRef.current !== data.task_id) return
      const entryId = activeEntryRef.current
      const progress = clampPercent(data.progress)

      const detail = data.speed
        ? `${data.speed}${data.eta ? ` · ETA ${data.eta}` : ''}`
        : data.message

      if (data.status === 'running') {
        if (entryId) {
          setRun({ kind: 'running', taskId: data.task_id, entryId, progress, detail })
        }
        patchJob(data.task_id, { status: 'running', progress, detail })
        return
      }

      if (data.status === 'completed') {
        if (entryId) {
          setRun({
            kind: 'done',
            taskId: data.task_id,
            entryId,
            output: data.output_path ?? '',
            outputName: data.output_name,
          })
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === entryId
                ? { ...entry, status: 'done', output: data.output_path }
                : entry,
            ),
          )
        }
        patchJob(data.task_id, {
          status: 'completed',
          progress: 100,
          output: data.output_path,
          outputName: data.output_name,
          detail: undefined,
        })
        taskIdRef.current = null
        activeEntryRef.current = null
      } else if (data.status === 'failed') {
        if (entryId) {
          setRun({
            kind: 'error',
            entryId,
            message: data.error || data.message || 'Video processing failed',
          })
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === entryId
                ? { ...entry, status: 'failed', error: data.error || data.message }
                : entry,
            ),
          )
        }
        patchJob(data.task_id, {
          status: 'failed',
          error: data.error || data.message,
        })
        taskIdRef.current = null
        activeEntryRef.current = null
      } else if (data.status === 'cancelled') {
        if (entryId) {
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === entryId ? { ...entry, status: 'pending' } : entry,
            ),
          )
        }
        setRun({ kind: 'idle' })
        patchJob(data.task_id, { status: 'cancelled' })
        taskIdRef.current = null
        activeEntryRef.current = null
      }
    },
    [patchJob],
  )

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    listenVideoProgress((data) => {
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
  }, [handleProgress])

  const addFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setProbeError(null)
    try {
      const probes = await probeVideos(paths)
      setEntries((prev) => {
        const known = new Set(prev.map((e) => e.path))
        const fresh = probes
          .filter((p) => !known.has(p.path))
          .map((p, idx) => fromProbe(p, prev.length + idx))
        const next = [...prev, ...fresh]
        if (!selectedId && next[0]) setSelectedId(next[0].id)
        return next
      })
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'Failed to read video')
    }
  }, [selectedId])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const clear = useCallback(() => {
    if (run.kind === 'running') return
    setEntries([])
    setSelectedId(null)
    setRun({ kind: 'idle' })
  }, [run.kind])

  const start = useCallback(async () => {
    const target = entries.find((entry) => entry.id === selectedId && entry.status !== 'failed')
    if (!target) return

    activeEntryRef.current = target.id
    setRun({ kind: 'running', taskId: '', entryId: target.id, progress: 0 })
    setEntries((prev) =>
      prev.map((entry) => (entry.id === target.id ? { ...entry, status: 'running', output: undefined, error: undefined } : entry)),
    )

    try {
      const taskId = await startVideoProcess({ path: target.path, settings })
      taskIdRef.current = taskId
      upsertJob({
        id: taskId,
        kind: 'video',
        label: target.name,
        status: 'running',
        progress: 0,
      })
      setRun({ kind: 'running', taskId, entryId: target.id, progress: 0 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start'
      setRun({ kind: 'error', entryId: target.id, message })
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === target.id ? { ...entry, status: 'failed', error: message } : entry,
        ),
      )
      activeEntryRef.current = null
    }
  }, [entries, selectedId, settings, upsertJob])

  const cancel = useCallback(async () => {
    const taskId = taskIdRef.current
    if (!taskId) return
    try {
      await cancelVideoProcess(taskId)
    } catch {
      // Already terminated.
    }
  }, [])

  return {
    entries,
    selectedId,
    setSelectedId,
    settings,
    setSettings,
    run,
    probeError,
    addFiles,
    removeEntry,
    clear,
    start,
    cancel,
  }
}
