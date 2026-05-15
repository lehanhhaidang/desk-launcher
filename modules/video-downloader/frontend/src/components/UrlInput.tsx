import { useState } from 'react'
import { Clipboard, Link, Search } from 'lucide-react'
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
    <div className="vd-panel rounded-xl p-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Link className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 vd-muted" />
          <Input
            type="url"
            placeholder="Paste video URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="vd-input h-10 pl-9 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="vd-ghost-button h-10 gap-2"
        >
          <Clipboard className="size-4" />
          Paste
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!url.trim() || isLoading}
          className="vd-primary-button h-10 gap-2 px-5 font-semibold"
        >
          {isLoading ? <LoadingSpinner size="sm" /> : <Search className="size-4" />}
          {isLoading ? 'Fetching...' : 'Fetch'}
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] vd-subtle">
        <span>Supports:</span>
        {platforms.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full border border-sky-200/10 bg-sky-200/10 px-1.5 py-0.5"
          >
            {p.icon} {p.name}
          </span>
        ))}
        <span className="vd-muted">& more</span>
      </div>
    </div>
  )
}
