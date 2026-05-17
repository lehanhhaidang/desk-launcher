import { useState, type FormEvent } from 'react'
import { Clipboard, Link, Search } from 'lucide-react'
import { Button, Input, LoadingSpinner } from '../../../components/ui'
import { getSupportedPlatforms } from '../utils/platforms'

interface UrlInputProps {
  onFetch: (url: string) => void
  isLoading: boolean
}

export function UrlInput({ onFetch, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const platforms = getSupportedPlatforms()

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (url.trim()) onFetch(url.trim())
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text)
      if (text.trim()) onFetch(text.trim())
    } catch {
      // Clipboard access denied — silently fall back to manual paste.
    }
  }

  return (
    <div className="vd-url-card">
      <form onSubmit={handleSubmit} className="vd-url-form">
        <div className="vd-url-input-wrap">
          <Link className="vd-url-icon pointer-events-none size-4 vd-muted" />
          <Input
            type="url"
            placeholder="Paste a video URL..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="vd-input vd-url-input h-10 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="vd-ghost-button h-10 gap-2"
        >
          <Clipboard className="size-4 shrink-0" />
          <span className="truncate">Paste</span>
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!url.trim() || isLoading}
          className="vd-primary-button h-10 min-w-[112px] gap-2 px-5 font-semibold"
        >
          {isLoading ? <LoadingSpinner size="sm" /> : <Search className="size-4 shrink-0" />}
          <span className="truncate">{isLoading ? 'Fetching...' : 'Fetch'}</span>
        </Button>
      </form>

      <div className="vd-support-row">
        <span className="shrink-0">Supports:</span>
        {platforms.map((platform) => (
          <span key={platform.id} className="vd-support-chip" title={platform.name}>
            <span className="shrink-0">{platform.icon}</span>
            <span className="truncate">{platform.name}</span>
          </span>
        ))}
        <span className="shrink-0 vd-muted">& more</span>
      </div>
    </div>
  )
}
