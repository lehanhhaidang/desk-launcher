import { FileAudio, Film } from 'lucide-react'
import { Button } from '../../../components/ui'
import type { CaptureOutput } from '../types'

interface FormatSelectorProps {
  value: CaptureOutput
  onChange: (value: CaptureOutput) => void
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="vd-panel vd-control-panel">
      <label className="vd-field-label">Output format</label>
      <div className="vd-segmented" role="radiogroup" aria-label="Output format">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          role="radio"
          aria-checked={value === 'mp4'}
          onClick={() => onChange('mp4')}
          className="vd-segment"
          data-active={value === 'mp4'}
        >
          <Film className="size-3.5 shrink-0" />
          <span>MP4</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          role="radio"
          aria-checked={value === 'mp3'}
          onClick={() => onChange('mp3')}
          className="vd-segment"
          data-active={value === 'mp3'}
        >
          <FileAudio className="size-3.5 shrink-0" />
          <span>MP3</span>
        </Button>
      </div>
    </div>
  )
}
