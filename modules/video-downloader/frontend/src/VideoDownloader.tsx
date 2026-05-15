import { useState, useMemo, useRef, useCallback } from 'react'
import { useVideoInfo } from './hooks/use-video-info'
import {
  startDownload,
  readDownloadedFile,
  cancelDownload,
  cleanupTask,
} from './api/video-api'
import type { DownloadProgress } from './api/video-api'
import { detectPlatform } from './utils/platforms'
import { UrlInput } from './components/UrlInput'
import { VideoPreview } from './components/VideoPreview'
import { FormatSelector } from './components/FormatSelector'
import { QualitySelector } from './components/QualitySelector'
import { DownloadButton } from './components/DownloadButton'
import type { DownloadState } from './components/DownloadButton'
import type { OutputType } from './types/video.types'

export default function VideoDownloader() {
  const { videoInfo, isLoading, error, fetchInfo } = useVideoInfo()

  const [outputType, setOutputType] = useState<OutputType>('mp4')
  const [selectedFormat, setSelectedFormat] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [downloadState, setDownloadState] = useState<DownloadState>({ type: 'idle' })

  const abortRef = useRef<AbortController | null>(null)
  const taskIdRef = useRef<string | null>(null)

  const platform = useMemo(() => detectPlatform(currentUrl), [currentUrl])

  // Derive the default format
  const defaultFormat = useMemo(() => {
    if (!videoInfo) return ''
    const formats = outputType === 'mp4' ? videoInfo.video_formats : videoInfo.audio_formats
    return formats.length > 0 ? formats[0].format_id : ''
  }, [videoInfo, outputType])

  const activeFormat = selectedFormat || defaultFormat

  const handleFetch = (url: string) => {
    setCurrentUrl(url)
    setSelectedFormat('')
    setDownloadState({ type: 'idle' })
    fetchInfo(url)
  }

  const handleOutputTypeChange = (type: OutputType) => {
    setOutputType(type)
    setSelectedFormat('')
    setDownloadState({ type: 'idle' })
  }

  const handleStartDownload = useCallback(async () => {
    if (!activeFormat || !currentUrl) return

    const abort = new AbortController()
    abortRef.current = abort

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
        (progress: DownloadProgress) => {
          taskIdRef.current = progress.task_id

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
        },
        abort.signal,
      )
    } catch (err) {
      if (abort.signal.aborted) return
      setDownloadState({
        type: 'error',
        message: err instanceof Error ? err.message : 'Download failed',
      })
    }
  }, [activeFormat, currentUrl, outputType])

  const handleSave = useCallback(async () => {
    if (downloadState.type !== 'completed') return

    const isTauri = '__TAURI_INTERNALS__' in window

    if (isTauri) {
      // Desktop: native Save As dialog
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')

      const ext = downloadState.filename.split('.').pop() || 'mp4'
      const filePath = await save({
        defaultPath: downloadState.filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })

      if (filePath) {
        // Pull bytes from the Rust plugin (the temp file lives in the
        // module's per-app-data downloads dir) and write to the chosen path.
        const bytes = await readDownloadedFile(downloadState.taskId)
        await writeFile(filePath, bytes)
      }
    } else {
      // Browser fallback — not reachable in Tauri builds; left as a no-op.
      console.warn('Save without Tauri context not supported.')
    }

    setTimeout(() => {
      cleanupTask(downloadState.taskId)
    }, 5000)
  }, [downloadState])

  const handleCancel = useCallback(async () => {
    abortRef.current?.abort()

    if (taskIdRef.current) {
      await cancelDownload(taskIdRef.current).catch(() => {})
      taskIdRef.current = null
    }

    setDownloadState({ type: 'idle' })
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <UrlInput onFetch={handleFetch} isLoading={isLoading} />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {videoInfo && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <VideoPreview info={videoInfo} platform={platform} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormatSelector value={outputType} onChange={handleOutputTypeChange} />
            <QualitySelector
              outputType={outputType}
              videoFormats={videoInfo.video_formats}
              audioFormats={videoInfo.audio_formats}
              value={activeFormat}
              onChange={setSelectedFormat}
            />
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
