import type { PlatformInfo } from '../types'

const PLATFORMS: PlatformInfo[] = [
  { id: 'youtube', name: 'YouTube', icon: '▶️', color: 'from-red-500 to-red-600' },
  { id: 'bilibili', name: 'Bilibili', icon: '📺', color: 'from-sky-400 to-blue-500' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: 'from-pink-500 to-violet-500' },
  { id: 'twitter', name: 'X / Twitter', icon: '𝕏', color: 'from-gray-500 to-gray-700' },
  { id: 'facebook', name: 'Facebook', icon: '📘', color: 'from-blue-500 to-blue-700' },
  { id: 'instagram', name: 'Instagram', icon: '📷', color: 'from-purple-500 to-pink-500' },
  { id: 'twitch', name: 'Twitch', icon: '🟣', color: 'from-purple-500 to-purple-700' },
  { id: 'unknown', name: 'Video', icon: '🎬', color: 'from-gray-400 to-gray-600' },
]

const URL_PATTERNS: [RegExp, string][] = [
  [/youtube\.com|youtu\.be/i, 'youtube'],
  [/bilibili\.com|b23\.tv/i, 'bilibili'],
  [/tiktok\.com/i, 'tiktok'],
  [/twitter\.com|x\.com/i, 'twitter'],
  [/facebook\.com|fb\.watch/i, 'facebook'],
  [/instagram\.com/i, 'instagram'],
  [/twitch\.tv/i, 'twitch'],
]

export function detectPlatform(url: string): PlatformInfo {
  for (const [pattern, id] of URL_PATTERNS) {
    if (pattern.test(url)) {
      return PLATFORMS.find((p) => p.id === id)!
    }
  }
  return PLATFORMS.find((p) => p.id === 'unknown')!
}

export function getSupportedPlatforms(): PlatformInfo[] {
  return PLATFORMS.filter((p) => p.id !== 'unknown')
}
