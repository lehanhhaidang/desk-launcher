import { Badge } from '@desk-launcher/ui'
import type { VideoInfo, PlatformInfo } from '../types/video.types'

function proxyThumbnail(url: string): string {
  // No Python proxy anymore — load direct. Tauri's WebView (Chromium-based)
  // doesn't enforce hotlinking-Referer; most thumbnails work as-is. If a
  // host blocks (rare), we silently fail the <img> and show platform icon.
  return url
}

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
    <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm sm:flex-row">
      {/* Thumbnail */}
      {info.thumbnail && (
        <div className="relative flex-shrink-0 overflow-hidden rounded-lg">
          <img
            src={proxyThumbnail(info.thumbnail)}
            alt={info.title}
            className="h-auto w-full object-cover sm:h-36 sm:w-64"
          />
          {info.duration_string && (
            <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-xs font-medium text-white">
              {info.duration_string}
            </span>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col gap-2">
        <h3 className="line-clamp-2 text-lg font-semibold leading-tight">
          {info.title}
        </h3>
        <div className="flex items-center gap-2">
          {info.channel && (
            <p className="text-sm text-muted-foreground">{info.channel}</p>
          )}
          <Badge className={`bg-gradient-to-r ${platform.color} text-white text-xs border-0`}>
            {platform.icon} {platform.name}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {info.view_count != null && (
            <Badge variant="secondary">
              👁 {formatViewCount(info.view_count)} views
            </Badge>
          )}
          {info.video_formats.length > 0 && (
            <Badge variant="secondary">
              🎥 {info.video_formats.length} video formats
            </Badge>
          )}
          {info.audio_formats.length > 0 && (
            <Badge variant="secondary">
              🎵 {info.audio_formats.length} audio formats
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
