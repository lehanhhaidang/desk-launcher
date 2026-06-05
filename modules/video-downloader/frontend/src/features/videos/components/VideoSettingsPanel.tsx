import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui'
import type {
  AudioContainer,
  CompressionPreset,
  VideoAction,
  VideoContainer,
  VideoProcessSettings,
} from '../types'

interface VideoSettingsPanelProps {
  settings: VideoProcessSettings
  onChange: (next: VideoProcessSettings) => void
  disabled?: boolean
}

const ACTIONS: Array<{ value: VideoAction; label: string }> = [
  { value: 'convert', label: 'Convert' },
  { value: 'compress', label: 'Compress' },
  { value: 'extract-audio', label: 'Audio' },
  { value: 'trim', label: 'Trim' },
]

const CONTAINERS: Array<{ value: VideoContainer; label: string }> = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'mov', label: 'MOV' },
]

const AUDIO_CONTAINERS: Array<{ value: AudioContainer; label: string }> = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'wav', label: 'WAV' },
]

const COMPRESSION: Array<{ value: CompressionPreset; label: string }> = [
  { value: 'high-quality', label: 'High quality' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'small', label: 'Small file' },
]

function patch(
  current: VideoProcessSettings,
  partial: Partial<VideoProcessSettings>,
): VideoProcessSettings {
  return { ...current, ...partial }
}

export function VideoSettingsPanel({ settings, onChange, disabled }: VideoSettingsPanelProps) {
  return (
    <div className="vd-settings-panel">
      <div className="vd-settings-row">
        <label className="vd-field-label">Action</label>
        <div className="vd-segmented vd-segmented-quad" role="radiogroup" aria-label="Video action">
          {ACTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="ghost"
              role="radio"
              aria-checked={settings.action === option.value}
              disabled={disabled}
              data-active={settings.action === option.value}
              onClick={() => onChange(patch(settings, { action: option.value }))}
              className="vd-segment"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {(settings.action === 'convert' || settings.action === 'compress' || settings.action === 'trim') && (
        <div className="vd-settings-row">
          <label className="vd-field-label">Container</label>
          <Select
            value={settings.container}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(patch(settings, { container: value as VideoContainer }))
            }
          >
            <SelectTrigger className="vd-input h-9 w-full min-w-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="vd-select-content">
              {CONTAINERS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-sm">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {settings.action === 'compress' && (
        <div className="vd-settings-row">
          <label className="vd-field-label">Compression preset</label>
          <Select
            value={settings.compression}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(patch(settings, { compression: value as CompressionPreset }))
            }
          >
            <SelectTrigger className="vd-input h-9 w-full min-w-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="vd-select-content">
              {COMPRESSION.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-sm">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {settings.action === 'extract-audio' && (
        <div className="vd-settings-row">
          <label className="vd-field-label">Audio format</label>
          <Select
            value={settings.audio_container}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(patch(settings, { audio_container: value as AudioContainer }))
            }
          >
            <SelectTrigger className="vd-input h-9 w-full min-w-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="vd-select-content">
              {AUDIO_CONTAINERS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-sm">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {settings.action === 'trim' && (
        <div className="vd-settings-row">
          <label className="vd-field-label">Trim (hh:mm:ss)</label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="text"
              placeholder="Start (00:00:00)"
              value={settings.trim.start}
              disabled={disabled}
              className="vd-input h-9 text-sm"
              onChange={(event) =>
                onChange(patch(settings, { trim: { ...settings.trim, start: event.target.value } }))
              }
            />
            <Input
              type="text"
              placeholder="End (optional)"
              value={settings.trim.end}
              disabled={disabled}
              className="vd-input h-9 text-sm"
              onChange={(event) =>
                onChange(patch(settings, { trim: { ...settings.trim, end: event.target.value } }))
              }
            />
          </div>
          <p className="vd-muted text-xs">
            Leave end blank to trim to the end of the clip.
          </p>
        </div>
      )}
    </div>
  )
}
