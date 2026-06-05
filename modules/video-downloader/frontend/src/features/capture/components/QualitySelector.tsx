import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui'
import { formatFileSize } from '../../../shared/format'
import type { CaptureOutput, VideoFormat } from '../types'

interface QualitySelectorProps {
  outputType: CaptureOutput
  videoFormats: VideoFormat[]
  audioFormats: VideoFormat[]
  value: string
  onChange: (formatId: string) => void
}

function getHeight(format: VideoFormat): number {
  const resolution = format.resolution || format.note || ''
  const xMatch = resolution.match(/x(\d{3,4})/)
  if (xMatch) return Number(xMatch[1])
  const pMatch = resolution.match(/(\d{3,4})p/)
  if (pMatch) return Number(pMatch[1])
  return 0
}

function getBitrate(format: VideoFormat): number {
  return format.abr || format.tbr || 0
}

function getVideoLabel(f: VideoFormat): string {
  const parts: string[] = []
  if (f.resolution) parts.push(f.resolution)
  if (f.fps) parts.push(`${f.fps}fps`)
  if (f.note) parts.push(f.note)
  const size = formatFileSize(f.filesize || f.filesize_approx)
  if (size) parts.push(`(${size})`)
  return parts.join(' - ') || f.format_id
}

function getAudioLabel(f: VideoFormat): string {
  const parts: string[] = []
  if (f.abr) parts.push(`${Math.round(f.abr)} kbps`)
  if (f.note) parts.push(f.note)
  if (f.ext) parts.push(f.ext)
  const size = formatFileSize(f.filesize || f.filesize_approx)
  if (size) parts.push(`(${size})`)
  return parts.join(' - ') || f.format_id
}

function uniqueFormats(options: VideoFormat[]): VideoFormat[] {
  const seen = new Set<string>()
  return options.filter((format) => {
    if (seen.has(format.format_id)) return false
    seen.add(format.format_id)
    return true
  })
}

function buildVideoOptions(formats: VideoFormat[]): VideoFormat[] {
  const videoOnly = formats.filter((format) => format.has_video)
  const source = videoOnly.length > 0 ? videoOnly : formats
  const sorted = [...source].sort((a, b) => {
    const heightDiff = getHeight(b) - getHeight(a)
    if (heightDiff !== 0) return heightDiff
    return getBitrate(b) - getBitrate(a)
  })

  const pickAtOrBelow = (target: number) =>
    sorted.find((format) => {
      const height = getHeight(format)
      return height > 0 && height <= target
    })

  return uniqueFormats(
    [sorted[0], pickAtOrBelow(1080), pickAtOrBelow(720), pickAtOrBelow(480)].filter(Boolean) as VideoFormat[],
  )
}

function buildAudioOptions(formats: VideoFormat[]): VideoFormat[] {
  const audioOnly = formats.filter((format) => format.has_audio && !format.has_video)
  const source = audioOnly.length > 0 ? audioOnly : formats
  const sorted = [...source].sort((a, b) => getBitrate(b) - getBitrate(a))

  const pickClosest = (target: number) =>
    [...sorted].sort(
      (a, b) => Math.abs(getBitrate(a) - target) - Math.abs(getBitrate(b) - target),
    )[0]

  return uniqueFormats(
    [sorted[0], pickClosest(320), pickClosest(192), pickClosest(128)].filter(Boolean) as VideoFormat[],
  )
}

function FormatLabel({ children }: { children: string }) {
  return (
    <span className="vd-select-label" title={children}>
      {children}
    </span>
  )
}

export function QualitySelector({
  outputType,
  videoFormats,
  audioFormats,
  value,
  onChange,
}: QualitySelectorProps) {
  const formats = outputType === 'mp4'
    ? buildVideoOptions(videoFormats)
    : buildAudioOptions(audioFormats)
  const label = outputType === 'mp4' ? 'Video quality' : 'Audio quality'
  const getLabel = outputType === 'mp4' ? getVideoLabel : getAudioLabel
  const selectedValue = formats.some((format) => format.format_id === value)
    ? value
    : formats[0]?.format_id

  if (formats.length === 0) {
    return (
      <div className="vd-panel vd-control-panel">
        <label className="vd-field-label">{label}</label>
        <p className="text-sm vd-muted">No formats available</p>
      </div>
    )
  }

  return (
    <div className="vd-panel vd-control-panel">
      <label className="vd-field-label">{label}</label>
      <Select value={selectedValue} onValueChange={onChange}>
        <SelectTrigger className="vd-input h-10 w-full min-w-0 text-xs">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent position="popper" align="start" sideOffset={6} className="vd-select-content">
          {formats.map((f) => (
            <SelectItem key={f.format_id} value={f.format_id} className="text-xs">
              <FormatLabel>{getLabel(f)}</FormatLabel>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
