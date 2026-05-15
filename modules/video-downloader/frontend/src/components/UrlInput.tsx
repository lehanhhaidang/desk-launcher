import { useState } from 'react'
import { Input } from '@desk-launcher/ui'
import { Button } from '@desk-launcher/ui'
import { LoadingSpinner } from '@desk-launcher/ui'
import { getSupportedPlatforms } from '../utils/platforms'

interface UrlInputProps {
  onFetch: (url: string) => void
  isLoading: boolean
}

export function UrlInput({ onFetch, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const platforms = getSupportedPlatforms()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) onFetch(url.trim())
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text)
      if (text.trim()) onFetch(text.trim())
    } catch {
      // Clipboard access denied
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <Input
          type="url"
          placeholder="Paste video URL here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-12 flex-1 border-border/50 bg-background/50 text-base backdrop-blur-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handlePaste}
          className="h-12 gap-2 border-border/50"
        >
          📋 Paste
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={!url.trim() || isLoading}
          className="h-12 gap-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
        >
          {isLoading ? <LoadingSpinner size="sm" /> : '🔍'}
          {isLoading ? 'Fetching...' : 'Fetch'}
        </Button>
      </form>

      {/* Supported platforms */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Supports:</span>
        {platforms.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5"
          >
            {p.icon} {p.name}
          </span>
        ))}
        <span className="text-muted-foreground/50">& more</span>
      </div>
    </div>
  )
}
