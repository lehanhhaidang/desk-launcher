import { useState, useMemo, useRef, useCallback } from 'react'
import { AlertTriangle, Download, Film, Music, Radio } from 'lucide-react'
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
    } else {
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
    <div className="vd-shell">
      <div className="vd-page space-y-3">
        <header className="vd-panel rounded-xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200/20 bg-sky-200/10 px-2.5 py-1 vd-mono text-[10px] font-bold uppercase tracking-wider text-sky-100">
                <Radio className="size-3.5" />
                Media capture
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-[#eef6ff]">Video Downloader</h1>
              <p className="mt-1 max-w-md text-xs leading-5 vd-subtle">
                Fetch metadata, choose output format, save video or audio via yt-dlp + ffmpeg.
              </p>
            </div>
            <div className="vd-metrics">
              <div className="vd-card flex items-center gap-2 rounded-lg px-2.5 py-2">
                <Film className="size-4 shrink-0 text-sky-200" />
                <div className="min-w-0">
                  <div className="vd-mono text-[9px] font-bold uppercase tracking-wider vd-muted">Video</div>
                  <div className="text-xs font-semibold">MP4</div>
                </div>
              </div>
              <div className="vd-card flex items-center gap-2 rounded-lg px-2.5 py-2">
                <Music className="size-4 shrink-0 text-pink-200" />
                <div className="min-w-0">
                  <div className="vd-mono text-[9px] font-bold uppercase tracking-wider vd-muted">Audio</div>
                  <div className="text-xs font-semibold">MP3</div>
                </div>
              </div>
              <div className="vd-card flex items-center gap-2 rounded-lg px-2.5 py-2">
                <Download className="size-4 shrink-0 text-indigo-200" />
                <div className="min-w-0">
                  <div className="vd-mono text-[9px] font-bold uppercase tracking-wider vd-muted">Engine</div>
                  <div className="text-xs font-semibold">yt-dlp</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-2xl space-y-3">
          <UrlInput onFetch={handleFetch} isLoading={isLoading} />

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-300/25 bg-red-400/10 p-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
            </div>
          )}

          {videoInfo && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <VideoPreview info={videoInfo} platform={platform} />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="sm:w-[220px] sm:shrink-0">
                  <FormatSelector value={outputType} onChange={handleOutputTypeChange} />
                </div>
                <div className="min-w-0 sm:flex-1">
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
      </div>
    </div>
  )
}
