// Videos tab — local video utilities backed by the ffmpeg sidecar.
// Single-file workflow for the MVP; the backend command accepts one path per
// task so the queue surfaces each export individually.

import { useCallback } from 'react'
import { FileVideo, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { DropZone } from '../../components/common/DropZone'
import { ErrorBanner } from '../../components/common/ErrorBanner'
import { SectionHeader } from '../../components/common/SectionHeader'
import { VideoExportPanel } from './components/VideoExportPanel'
import { VideoFileList } from './components/VideoFileList'
import { VideoSettingsPanel } from './components/VideoSettingsPanel'
import { useVideoPipeline } from './hooks/use-video-pipeline'
import { SUPPORTED_VIDEO_EXTENSIONS } from './types'

interface VideosTabProps {
  active: boolean
}

export function VideosTab({ active }: VideosTabProps) {
  const {
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
  } = useVideoPipeline()

  const isRunning = run.kind === 'running'
  const selected = entries.find((entry) => entry.id === selectedId)
  const canStart = !isRunning && !!selected && selected.status !== 'failed'

  const handlePick = useCallback(async () => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selection = await open({
      multiple: true,
      filters: [
        {
          name: 'Videos',
          extensions: [...SUPPORTED_VIDEO_EXTENSIONS],
        },
      ],
    })
    if (!selection) return
    const paths = Array.isArray(selection) ? selection : [selection]
    await addFiles(paths)
  }, [addFiles])

  return (
    <div className="vd-feature-stack">
      <SectionHeader
        label="Videos"
        title="Local video processing"
        actions={
          entries.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isRunning}
              onClick={clear}
              className="vd-ghost-button gap-2"
            >
              <Trash2 className="size-4" />
              <span>Clear list</span>
            </Button>
          ) : null
        }
      />

      <DropZone
        active={active && !isRunning}
        accept={[...SUPPORTED_VIDEO_EXTENSIONS]}
        onAccept={addFiles}
        onPick={handlePick}
        icon={<FileVideo className="size-5" />}
        title="Drop videos here"
        description="MP4, MOV, MKV, WebM, AVI — convert, compress, trim, or extract audio."
      />

      {probeError && <ErrorBanner message={probeError} />}

      <div className="vd-images-grid">
        <div className="vd-images-main">
          <VideoFileList
            entries={entries}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeEntry}
            disabled={isRunning}
          />
        </div>
        <aside className="vd-images-side">
          <VideoSettingsPanel
            settings={settings}
            onChange={setSettings}
            disabled={isRunning}
          />
          <VideoExportPanel
            run={run}
            canStart={canStart}
            onStart={start}
            onCancel={cancel}
          />
        </aside>
      </div>
    </div>
  )
}
