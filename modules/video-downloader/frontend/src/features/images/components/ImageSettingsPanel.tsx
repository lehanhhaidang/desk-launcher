import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
} from '../../../components/ui'
import type { ImageOutputFormat, ImageOutputSettings } from '../types'

interface ImageSettingsPanelProps {
  settings: ImageOutputSettings
  onChange: (next: ImageOutputSettings) => void
  disabled?: boolean
}

const FORMAT_OPTIONS: Array<{ value: ImageOutputFormat; label: string }> = [
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
]

function patch(
  current: ImageOutputSettings,
  partial: Partial<ImageOutputSettings>,
): ImageOutputSettings {
  return { ...current, ...partial }
}

export function ImageSettingsPanel({ settings, onChange, disabled }: ImageSettingsPanelProps) {
  const supportsQuality = settings.format !== 'png'

  return (
    <div className="vd-settings-panel">
      <div className="vd-settings-row">
        <label className="vd-field-label">Output format</label>
        <Select
          value={settings.format}
          disabled={disabled}
          onValueChange={(value) => onChange(patch(settings, { format: value as ImageOutputFormat }))}
        >
          <SelectTrigger className="vd-input h-9 w-full min-w-0 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="vd-select-content">
            {FORMAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-sm">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="vd-settings-row">
        <label className="vd-field-label">
          Quality
          {supportsQuality && (
            <span className="vd-muted ml-2 text-xs">{settings.quality}%</span>
          )}
        </label>
        <Slider
          value={[settings.quality]}
          min={10}
          max={100}
          step={1}
          disabled={disabled || !supportsQuality}
          onValueChange={([value]) => onChange(patch(settings, { quality: value }))}
        />
        {!supportsQuality && (
          <p className="vd-muted text-xs">PNG ignores quality (lossless).</p>
        )}
      </div>

      <div className="vd-settings-row">
        <label className="vd-field-label">Resize (px)</label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={1}
            placeholder="Width"
            value={settings.resize_width ?? ''}
            disabled={disabled}
            className="vd-input h-9 text-sm"
            onChange={(event) =>
              onChange(patch(settings, {
                resize_width: event.target.value ? Number(event.target.value) : null,
              }))
            }
          />
          <Input
            type="number"
            min={1}
            placeholder="Height"
            value={settings.resize_height ?? ''}
            disabled={disabled}
            className="vd-input h-9 text-sm"
            onChange={(event) =>
              onChange(patch(settings, {
                resize_height: event.target.value ? Number(event.target.value) : null,
              }))
            }
          />
        </div>
        <div className="vd-toggle-row">
          <Switch
            id="image-aspect-ratio"
            checked={settings.preserve_aspect_ratio}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(patch(settings, { preserve_aspect_ratio: checked }))
            }
          />
          <label htmlFor="image-aspect-ratio" className="vd-toggle-label">
            Preserve aspect ratio
          </label>
        </div>
      </div>

      <div className="vd-settings-row">
        <label className="vd-field-label" htmlFor="image-naming">
          Output name pattern
        </label>
        <Input
          id="image-naming"
          type="text"
          spellCheck={false}
          value={settings.naming_pattern}
          disabled={disabled}
          className="vd-input h-9 text-sm"
          onChange={(event) =>
            onChange(patch(settings, { naming_pattern: event.target.value }))
          }
        />
        <p className="vd-muted text-xs">
          Tokens: {'{name}'} {'{index}'} {'{format}'} {'{width}'} {'{height}'}
        </p>
      </div>
    </div>
  )
}
