// Capture tab — link-based downloader powered by the yt-dlp + ffmpeg sidecars.
// Keeps its own foreground state (idle / downloading / completed / error) for
// the action panel and mirrors that state into the shared job store so the
// Queue tab can render the same job from a single source of truth.

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  cancelDownload,
  cleanupCaptureTask,
  readDownloadedFile,
  startDownload,
} from './api/capture-api'
import type { CaptureProgress } from './api/capture-api'
import { DownloadButton, type DownloadState } from './components/DownloadButton'
import { FormatSelector } from './components/FormatSelector'
import { QualitySelector } from './components/QualitySelector'
import { UrlInput } from './components/UrlInput'
import { VideoPreview } from './components/VideoPreview'
import { useVideoInfo } from './hooks/use-video-info'
import type { CaptureOutput } from './types'
import { detectPlatform } from './utils/platforms'
import { ErrorBanner } from '../../components/common/ErrorBanner'
import { SectionHeader } from '../../components/common/SectionHeader'
import { useJobStore } from '../queue/job-store'
import { clampPercent } from '../../shared/format'
import type { MediaJobStatus } from '../../shared/types'

function mapCaptureStatus(status: CaptureProgress['status']): MediaJobStatus {
  switch (status) {
    case 'pending':
      return 'queued'
    case 'downloading':
      return 'running'
    case 'processing':
      return 'processing'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
  }
}

export function CaptureTab() {
  const { videoInfo, isLoading, error, fetchInfo } = useVideoInfo()

  const [outputType, setOutputType] = useState<CaptureOutput>('mp4')
  const [selectedFormat, setSelectedFormat] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [downloadState, setDownloadState] = useState<DownloadState>({ type: 'idle' })

  const abortRef = useRef<AbortController | null>(null)
  const taskIdRef = useRef<string | null>(null)

  const upsertJob = useJobStore((s) => s.upsert)
  const patchJob = useJobStore((s) => s.patch)

  const platform = useMemo(() => detectPlatform(currentUrl), [currentUrl])

  const defaultFormat = useMemo(() => {
    if (!videoInfo) return ''
    const formats = outputType === 'mp4' ? videoInfo.video_formats : videoInfo.audio_formats
    return formats[0]?.format_id ?? ''
  }, [videoInfo, outputType])

  const activeFormat = selectedFormat || defaultFormat

  const handleFetch = (url: string) => {
    setCurrentUrl(url)
    setSelectedFormat('')
    setDownloadState({ type: 'idle' })
    fetchInfo(url)
  }

  const handleOutputTypeChange = (type: CaptureOutput) => {
    setOutputType(type)
    setSelectedFormat('')
    setDownloadState({ type: 'idle' })
  }

  const captureLabel = videoInfo?.title?.trim() || currentUrl || 'Capture job'

  const reportProgress = useCallback(
    (progress: CaptureProgress) => {
      if (!progress.task_id) return
      const detail = progress.speed
        ? `${progress.speed}${progress.eta ? ` · ETA ${progress.eta}` : ''}`
        : undefined
      patchJob(progress.task_id, {
        status: mapCaptureStatus(progress.status),
        progress: clampPercent(progress.progress),
        detail,
        output: progress.filepath,
        outputName: progress.filename,
        error: progress.error,
      })
    },
    [patchJob],
  )

  const handleStartDownload = useCallback(async () => {
    if (!activeFormat || !currentUrl) return

    const abort = new AbortController()
    abortRef.current = abort
    taskIdRef.current = null

    setDownloadState({
      type: 'downloading',
      progress: {
        task_id: '',
        status: 'pending',
        progress: 0,
        speed: '',
        eta: '',
        file_size: 0,
      },
    })

    try {
      await startDownload(
        { url: currentUrl, format_id: activeFormat, output_type: outputType },
        (progress) => {
          taskIdRef.current = progress.task_id
          if (abort.signal.aborted && progress.status !== 'cancelled') return

          if (progress.status === 'completed') {
            setDownloadState({
              type: 'completed',
              taskId: progress.task_id,
              filename: progress.filename || 'download',
              fileSize: progress.file_size,
            })
          } else if (progress.status === 'failed') {
            setDownloadState({
              type: 'error',
              message: progress.error || 'Download failed',
            })
          } else if (progress.status === 'cancelled') {
            setDownloadState({ type: 'idle' })
          } else {
            setDownloadState({ type: 'downloading', progress })
          }
          reportProgress(progress)
        },
        abort.signal,
        (taskId) => {
          taskIdRef.current = taskId
          upsertJob({
            id: taskId,
            kind: 'capture',
            label: captureLabel,
            status: 'running',
          })
        },
      )
    } catch (err) {
      if (abort.signal.aborted) return
      const message = err instanceof Error ? err.message : 'Download failed'
      setDownloadState({ type: 'error', message })
      if (taskIdRef.current) {
        patchJob(taskIdRef.current, { status: 'failed', error: message })
      }
    }
  }, [activeFormat, captureLabel, currentUrl, outputType, patchJob, reportProgress, upsertJob])

  const handleSave = useCallback(async () => {
    if (downloadState.type !== 'completed') return
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) {
      console.warn('Save without Tauri context is not supported')
      return
    }

    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')

    const ext = downloadState.filename.split('.').pop() || 'mp4'
    const filePath = await save({
      defaultPath: downloadState.filename,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    })

    if (filePath) {
      const bytes = await readDownloadedFile(downloadState.taskId)
      await writeFile(filePath, bytes)
    }

    // Free temporary download a few seconds after save in case user wants to retry.
    window.setTimeout(() => {
      cleanupCaptureTask(downloadState.taskId).catch(() => {})
    }, 5000)
  }, [downloadState])

  const handleCancel = useCallback(async () => {
    abortRef.current?.abort()
    const taskId = taskIdRef.current
    if (taskId) {
      await cancelDownload(taskId).catch(() => {})
      patchJob(taskId, { status: 'cancelled' })
      taskIdRef.current = null
    }
    abortRef.current = null
    setDownloadState({ type: 'idle' })
  }, [patchJob])

  return (
    <div className="vd-feature-stack">
      <SectionHeader label="Capture" title="Capture from a link" />

      <UrlInput onFetch={handleFetch} isLoading={isLoading} />

      {error && <ErrorBanner message={error} />}

      {videoInfo && (
        <div className="vd-result">
          <VideoPreview info={videoInfo} platform={platform} />

          <div className="vd-controls">
            <div className="vd-format-column">
              <FormatSelector value={outputType} onChange={handleOutputTypeChange} />
            </div>
            <div className="vd-quality-column">
              <QualitySelector
                outputType={outputType}
                videoFormats={videoInfo.video_formats}
                audioFormats={videoInfo.audio_formats}
                value={activeFormat}
                onChange={setSelectedFormat}
              />
            </div>
          </div>

          <DownloadButton
            disabled={!activeFormat}
            downloadState={downloadState}
            outputType={outputType}
            onStart={handleStartDownload}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  )
}
