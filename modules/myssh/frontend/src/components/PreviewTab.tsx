import { useEffect, useState } from 'react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { Download, ExternalLink, FileWarning } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import { localReadText, sftpDownload, sftpReadText, type FilePreview } from '../api/myssh-api'
import { MarkdownView } from './MarkdownView'

interface Props {
  origin: 'local' | 'remote'
  path: string
  name: string
  sftpId?: string
}

const MD_RE = /\.(md|markdown|mdown|mkdn)$/i

export function PreviewTab({ origin, path, name, sftpId }: Props) {
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openInSystem = () => {
    openPath(path).catch((e) => toast.error(`Open failed: ${errMessage(e)}`))
  }

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(null)
    const fetcher =
      origin === 'local'
        ? localReadText(path)
        : sftpId
          ? sftpReadText(sftpId, path)
          : Promise.reject(new Error('no SFTP session'))
    fetcher
      .then((p) => {
        if (cancelled) return
        setPreview(p)
        // Local binary files open straight in the system's default app.
        if (origin === 'local' && p.isBinary && !p.tooLarge) openInSystem()
      })
      .catch((e) => {
        if (!cancelled) setError(errMessage(e))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, path, sftpId])

  const download = async () => {
    if (!sftpId) return
    const local = await saveDialog({ defaultPath: name })
    if (!local) return
    try {
      await sftpDownload(sftpId, crypto.randomUUID(), name, path, local, false)
      toast.success(`Downloaded ${name}`)
    } catch (e) {
      toast.error(`Download failed: ${errMessage(e)}`)
    }
  }

  if (error) {
    return <Centered>{error}</Centered>
  }
  if (!preview) {
    return <Centered>Loading…</Centered>
  }

  if (preview.tooLarge || preview.isBinary) {
    const reason = preview.tooLarge
      ? `Too large to preview (${formatSize(preview.size)})`
      : 'Binary file'
    return (
      <Centered>
        <FileWarning className="mb-3 size-10 text-[var(--text-faint)]" />
        <p className="mb-4 text-sm text-[var(--text-muted)]">{reason}</p>
        {origin === 'local' ? (
          <Button variant="outline" size="sm" onClick={openInSystem}>
            <ExternalLink className="size-4" /> Open with system app
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="size-4" /> Download
          </Button>
        )}
      </Centered>
    )
  }

  const isMarkdown = MD_RE.test(name)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-1.5">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 text-xs text-[var(--text-faint)]">{formatSize(preview.size)}</span>
        {origin === 'local' && (
          <button
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--brand)]"
            title="Open with system app"
            onClick={openInSystem}
          >
            <ExternalLink className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isMarkdown ? (
          <div className="mx-auto max-w-4xl">
            <MarkdownView content={preview.content ?? ''} />
          </div>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#0a0c11] p-4 font-mono text-sm leading-6 text-[#e6edf3]">
            {preview.content}
          </pre>
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
      {children}
    </div>
  )
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
