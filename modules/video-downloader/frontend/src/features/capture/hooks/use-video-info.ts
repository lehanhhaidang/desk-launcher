import { useCallback, useState } from 'react'
import { fetchVideoInfo } from '../api/capture-api'
import type { VideoInfo } from '../types'

export function useVideoInfo() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInfo = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setVideoInfo(null)
    try {
      const info = await fetchVideoInfo(url)
      setVideoInfo(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch video info')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setVideoInfo(null)
    setError(null)
  }, [])

  return { videoInfo, isLoading, error, fetchInfo, reset }
}
