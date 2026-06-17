import { Eye, FileAudio, Film } from 'lucide-react'
import { Badge } from '../../../components/ui'
import type { PlatformInfo, VideoInfo } from '../types'

interface VideoPreviewProps {
  info: VideoInfo
  platform: PlatformInfo
}

function formatViewCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

export function VideoPreview({ info, platform }: VideoPreviewProps) {
  return (
    <div className="vd-panel flex min-w-0 flex-col gap-3 rounded-xl p-3 sm:flex-row">
      {info.thumbnail && (
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-sky-200/10 bg-black/25 sm:w-56">
          <img
            src={info.thumbnail}
            alt={info.title}
            className="h-full w-full object-cover"
          />
          {info.duration_string && (
            <span className="absolute bottom-1.5 right-1.5 max-w-[calc(100%-12px)] truncate rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {info.duration_string}
            </span>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <h3 className="vd-title-clamp text-base font-semibold leading-snug text-[var(--text)]" title={info.title}>
            {info.title}
          </h3>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            {info.channel && (
              <p className="max-w-full min-w-0 truncate text-xs vd-subtle sm:max-w-[16rem]" title={info.channel}>
                {info.channel}
              </p>
            )}
            <Badge className={`vd-chip max-w-full shrink-0 bg-gradient-to-r ${platform.color} text-[11px] text-white border-0 sm:max-w-[9rem]`}>
              <span className="truncate">{platform.icon} {platform.name}</span>
            </Badge>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          {info.view_count != null && (
            <Badge variant="secondary" className="vd-chip max-w-full gap-1 border border-sky-200/10 bg-sky-200/10 text-[11px] text-sky-100">
              <Eye className="size-3 shrink-0" />
              <span className="truncate">{formatViewCount(info.view_count)} views</span>
            </Badge>
          )}
          {info.video_formats.length > 0 && (
            <Badge variant="secondary" className="vd-chip max-w-full gap-1 border border-indigo-200/10 bg-indigo-200/10 text-[11px] text-indigo-100">
              <Film className="size-3 shrink-0" />
              <span className="truncate">{info.video_formats.length} video formats</span>
            </Badge>
          )}
          {info.audio_formats.length > 0 && (
            <Badge variant="secondary" className="vd-chip max-w-full gap-1 border border-pink-200/10 bg-pink-200/10 text-[11px] text-pink-100">
              <FileAudio className="size-3 shrink-0" />
              <span className="truncate">{info.audio_formats.length} audio formats</span>
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
