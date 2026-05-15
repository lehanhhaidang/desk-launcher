import { Tabs, TabsList, TabsTrigger } from '@desk-launcher/ui'
import { FileAudio, Film } from 'lucide-react'
import type { OutputType } from '../types/video.types'

interface FormatSelectorProps {
  value: OutputType
  onChange: (value: OutputType) => void
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="vd-panel rounded-xl p-3">
      <label className="mb-2 block text-xs font-semibold vd-subtle">
        Output format
      </label>
      <Tabs value={value} onValueChange={(v) => onChange(v as OutputType)}>
        <TabsList className="grid h-10 w-full grid-cols-2 border border-sky-200/10 bg-black/20 p-1">
          <TabsTrigger value="mp4" className="gap-1.5 text-xs data-[state=active]:bg-sky-200/15 data-[state=active]:text-sky-100">
            <Film className="size-3.5" />
            MP4
          </TabsTrigger>
          <TabsTrigger value="mp3" className="gap-1.5 text-xs data-[state=active]:bg-pink-200/15 data-[state=active]:text-pink-100">
            <FileAudio className="size-3.5" />
            MP3
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
