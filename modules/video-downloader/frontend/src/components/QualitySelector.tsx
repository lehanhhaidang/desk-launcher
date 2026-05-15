import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@desk-launcher/ui'
import type { VideoFormat, OutputType } from '../types/video.types'

interface QualitySelectorProps {
  outputType: OutputType
  videoFormats: VideoFormat[]
  audioFormats: VideoFormat[]
  value: string
  onChange: (formatId: string) => void
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function getVideoLabel(f: VideoFormat): string {
  const parts: string[] = []
  if (f.resolution) parts.push(f.resolution)
  if (f.fps) parts.push(`${f.fps}fps`)
  if (f.note) parts.push(f.note)
  const size = formatFileSize(f.filesize || f.filesize_approx)
  if (size) parts.push(`(${size})`)
  return parts.join(' · ') || f.format_id
}

function getAudioLabel(f: VideoFormat): string {
  const parts: string[] = []
  if (f.abr) parts.push(`${Math.round(f.abr)} kbps`)
  if (f.note) parts.push(f.note)
  if (f.ext) parts.push(f.ext)
  const size = formatFileSize(f.filesize || f.filesize_approx)
  if (size) parts.push(`(${size})`)
  return parts.join(' · ') || f.format_id
}

export function QualitySelector({
  outputType,
  videoFormats,
  audioFormats,
  value,
  onChange,
}: QualitySelectorProps) {
  const formats = outputType === 'mp4' ? videoFormats : audioFormats
  const label = outputType === 'mp4' ? 'Video Quality' : 'Audio Quality'
  const getLabel = outputType === 'mp4' ? getVideoLabel : getAudioLabel

  if (formats.length === 0) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
        <p className="text-sm text-muted-foreground/70">No formats available</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12 border-border/50 bg-background/50 backdrop-blur-sm">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {formats.map((f) => (
            <SelectItem key={f.format_id} value={f.format_id}>
              {getLabel(f)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
