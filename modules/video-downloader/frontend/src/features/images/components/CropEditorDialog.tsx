// Per-image crop editor.
//
// Loads the selected image into a blob URL (via the Rust `read_bytes`
// command) so react-image-crop can mount it as an <img>. Crop coordinates are
// stored in the source's *natural* pixel space — react-image-crop reports
// percent units so we convert against the loaded image's natural dimensions
// before pushing them upstream.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PercentCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { RotateCcw, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingSpinner,
} from '../../../components/ui'
import { readImageBytes } from '../api/images-api'
import { ErrorBanner } from '../../../components/common/ErrorBanner'
import type { CropRect, ImageEntry } from '../types'

interface CropEditorDialogProps {
  entry: ImageEntry | null
  open: boolean
  onClose: () => void
  onApply: (id: string, crop: CropRect | null) => void
}

type AspectId = 'free' | '1:1' | '16:9' | '4:3' | '3:2'

const ASPECTS: Array<{ id: AspectId; label: string; value: number | undefined }> = [
  { id: 'free', label: 'Free', value: undefined },
  { id: '1:1', label: '1 : 1', value: 1 },
  { id: '16:9', label: '16 : 9', value: 16 / 9 },
  { id: '4:3', label: '4 : 3', value: 4 / 3 },
  { id: '3:2', label: '3 : 2', value: 3 / 2 },
]

function pixelCropToPercent(
  rect: CropRect,
  naturalWidth: number,
  naturalHeight: number,
): PercentCrop {
  return {
    unit: '%',
    x: (rect.x / naturalWidth) * 100,
    y: (rect.y / naturalHeight) * 100,
    width: (rect.width / naturalWidth) * 100,
    height: (rect.height / naturalHeight) * 100,
  }
}

function percentCropToPixels(
  percent: PercentCrop,
  naturalWidth: number,
  naturalHeight: number,
): CropRect | null {
  const width = Math.round((percent.width / 100) * naturalWidth)
  const height = Math.round((percent.height / 100) * naturalHeight)
  if (width < 1 || height < 1) return null
  return {
    x: Math.round((percent.x / 100) * naturalWidth),
    y: Math.round((percent.y / 100) * naturalHeight),
    width,
    height,
  }
}

function defaultCrop(aspect: number | undefined): PercentCrop {
  // Center a 80%-wide selection. If aspect is set, makeAspectCrop computes
  // the matching height automatically. `centerCrop` is overloaded by unit so
  // we keep the literal `unit: '%'` narrow until the return.
  if (aspect) {
    const aspected = makeAspectCrop({ unit: '%', width: 80 }, aspect, 100, 100)
    return centerCrop(aspected, 100, 100)
  }
  const seed: PercentCrop = { unit: '%', x: 10, y: 10, width: 80, height: 80 }
  return centerCrop(seed, 100, 100)
}

export function CropEditorDialog({ entry, open, onClose, onApply }: CropEditorDialogProps) {
  const [aspect, setAspect] = useState<AspectId>('free')
  const [crop, setCrop] = useState<Crop>()
  const [percentCrop, setPercentCrop] = useState<PercentCrop>()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  const aspectValue = useMemo(
    () => ASPECTS.find((option) => option.id === aspect)?.value,
    [aspect],
  )

  // (Re)load the image whenever the dialog opens for a new entry.
  useEffect(() => {
    if (!open || !entry) {
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    setLoading(true)
    setLoadError(null)
    readImageBytes(entry.path)
      .then((bytes) => {
        if (cancelled) return
        const blob = new Blob([new Uint8Array(bytes)])
        createdUrl = URL.createObjectURL(blob)
        setImageUrl(createdUrl)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to read image')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, entry])

  // Seed crop selection when image loads or aspect changes.
  const handleImageLoaded = useCallback(() => {
    const img = imageRef.current
    if (!img || !entry) return

    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    if (entry.crop) {
      const initial = pixelCropToPercent(entry.crop, naturalWidth, naturalHeight)
      setCrop(initial)
      setPercentCrop(initial)
    } else {
      const initial = defaultCrop(aspectValue)
      setCrop(initial)
      setPercentCrop(initial)
    }
  }, [aspectValue, entry])

  const handleAspectChange = (id: AspectId) => {
    setAspect(id)
    const aspectVal = ASPECTS.find((option) => option.id === id)?.value
    const next = defaultCrop(aspectVal)
    setCrop(next)
    setPercentCrop(next)
  }

  const handleApply = () => {
    if (!entry || !imageRef.current || !percentCrop) return
    const { naturalWidth, naturalHeight } = imageRef.current
    const rect = percentCropToPixels(percentCrop, naturalWidth, naturalHeight)
    onApply(entry.id, rect)
    onClose()
  }

  const handleClearCrop = () => {
    if (!entry) return
    onApply(entry.id, null)
    onClose()
  }

  if (!entry) return null

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="mtb-dialog-content mtb-crop-dialog">
        <DialogHeader>
          <DialogTitle>Crop · {entry.name}</DialogTitle>
          <DialogDescription>
            Drag the handles to set a crop region. The crop is applied before resize on export.
          </DialogDescription>
        </DialogHeader>

        <div className="mtb-aspect-row" role="radiogroup" aria-label="Aspect ratio">
          {ASPECTS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant="ghost"
              role="radio"
              aria-checked={aspect === option.id}
              data-active={aspect === option.id}
              className="vd-segment"
              onClick={() => handleAspectChange(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="mtb-crop-canvas">
          {loading && (
            <div className="mtb-crop-loading">
              <LoadingSpinner size="md" />
              <p>Loading image…</p>
            </div>
          )}
          {loadError && <ErrorBanner message={loadError} />}
          {imageUrl && !loadError && (
            <ReactCrop
              crop={crop}
              aspect={aspectValue}
              minWidth={20}
              minHeight={20}
              onChange={(pixelCrop, percent) => {
                setCrop(pixelCrop)
                setPercentCrop(percent)
              }}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt={entry.name}
                onLoad={handleImageLoaded}
                draggable={false}
                style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }}
              />
            </ReactCrop>
          )}
        </div>

        <DialogFooter className="mtb-crop-footer">
          {entry.crop && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="vd-ghost-button gap-2 mr-auto"
              onClick={handleClearCrop}
            >
              <RotateCcw className="size-4" />
              <span>Remove crop</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="vd-ghost-button gap-2"
            onClick={onClose}
          >
            <X className="size-4" />
            <span>Cancel</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="vd-primary-button gap-2"
            disabled={!imageUrl || !percentCrop}
            onClick={handleApply}
          >
            <span>Apply crop</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
