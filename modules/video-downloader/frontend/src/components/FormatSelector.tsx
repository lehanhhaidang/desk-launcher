import { Tabs, TabsList, TabsTrigger } from '@desk-launcher/ui'
import type { OutputType } from '../types/video.types'

interface FormatSelectorProps {
  value: OutputType
  onChange: (value: OutputType) => void
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Output Format
      </label>
      <Tabs value={value} onValueChange={(v) => onChange(v as OutputType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mp4" className="gap-2">
            🎬 MP4 Video
          </TabsTrigger>
          <TabsTrigger value="mp3" className="gap-2">
            🎵 MP3 Audio
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
