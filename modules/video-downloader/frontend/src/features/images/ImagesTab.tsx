// Images tab — batch convert / resize / compress local images.
//
// All actual processing happens in Rust (see modules/video-downloader/rust/src/image.rs).
// This component coordinates input selection, per-image crop, batch settings,
// and progress display.

import { useCallback, useState } from 'react'
import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { DropZone } from '../../components/common/DropZone'
import { ErrorBanner } from '../../components/common/ErrorBanner'
import { SectionHeader } from '../../components/common/SectionHeader'
import { CropEditorDialog } from './components/CropEditorDialog'
import { ImageFileList } from './components/ImageFileList'
import { ImageSettingsPanel } from './components/ImageSettingsPanel'
import { ImageExportPanel } from './components/ImageExportPanel'
import { useImagePipeline } from './hooks/use-image-pipeline'
import { SUPPORTED_IMAGE_EXTENSIONS } from './types'

interface ImagesTabProps {
  active: boolean
}

export function ImagesTab({ active }: ImagesTabProps) {
  const {
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
  } = useImagePipeline()

  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  const cropEntry = entries.find((entry) => entry.id === cropTargetId) ?? null

  const isRunning = run.kind === 'running'
  const totalQueued = entries.filter((entry) => entry.status !== 'failed').length

  const handlePick = useCallback(async () => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selection = await open({
      multiple: true,
      filters: [
        {
          name: 'Images',
          extensions: [...SUPPORTED_IMAGE_EXTENSIONS],
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
        label="Images"
        title="Batch image preparation"
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
        active={active && !isRunning && cropTargetId === null}
        accept={[...SUPPORTED_IMAGE_EXTENSIONS]}
        onAccept={addFiles}
        onPick={handlePick}
        icon={<ImageIcon className="size-5" />}
        title="Drop images here"
        description="PNG, JPG, WebP, GIF, BMP, TIFF — crop, convert, resize, or compress in one batch."
      />

      {probeError && <ErrorBanner message={probeError} />}

      <div className="vd-images-grid">
        <div className="vd-images-main">
          <ImageFileList
            entries={entries}
            onRemove={removeEntry}
            onEditCrop={setCropTargetId}
            disabled={isRunning}
          />
        </div>
        <aside className="vd-images-side">
          <ImageSettingsPanel
            settings={settings}
            onChange={setSettings}
            disabled={isRunning}
          />
          <ImageExportPanel
            run={run}
            totalQueued={totalQueued}
            onStart={start}
            onCancel={cancel}
          />
        </aside>
      </div>

      <CropEditorDialog
        open={cropTargetId !== null}
        entry={cropEntry}
        onClose={() => setCropTargetId(null)}
        onApply={setCrop}
      />
    </div>
  )
}
