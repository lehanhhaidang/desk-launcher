import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { readDir, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  FolderOpen,
  Loader2,
  PanelLeft,
  PanelRight,
  Save,
} from 'lucide-react'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@desk-launcher/ui'
import { AppearanceButton } from '@desk-launcher/theme'
import { convertFile, supportedExtensions } from './api/md-api'
import { MarkdownDocument } from './components/MarkdownDocument'

const FALLBACK_EXTS = [
  'docx', 'xlsx', 'xls', 'pptx', 'pdf',
  'html', 'htm', 'md', 'markdown', 'txt',
  'csv', 'json', 'xml', 'epub', 'ipynb', 'zip',
]

type PreviewFile = {
  id: string
  path: string
  name: string
  markdown: string
  format?: string
  status: 'ready' | 'converting' | 'error'
  error?: string
}

export default function MdConverter() {
  const [supported, setSupported] = useState<string[]>(FALLBACK_EXTS)
  const [files, setFiles] = useState<PreviewFile[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [splitPct, setSplitPct] = useState<number>(() => {
    const stored = Number(window.localStorage.getItem('md-converter:split-pct'))
    return Number.isFinite(stored) && stored >= 25 && stored <= 75 ? stored : 50
  })
  const mainRef = useRef<HTMLDivElement>(null)
  const splitRef = useRef(splitPct)

  useEffect(() => {
    supportedExtensions()
      .then((exts) => {
        if (exts.length > 0) setSupported(exts)
      })
      .catch(() => {
        /* fall back to defaults */
      })
  }, [])

  useEffect(() => {
    const prevent = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const webview = getCurrentWebview()
      const off = await webview.onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') {
          setDropActive(true)
        } else if (payload.type === 'leave') {
          setDropActive(false)
        } else if (payload.type === 'drop') {
          setDropActive(false)
          if (payload.paths.length > 0) void importPaths(payload.paths)
        }
      })
      unlisten = off
    })()
    return () => {
      unlisten?.()
    }
  }, [])

  const supportedSet = useMemo(() => new Set(supported.map((ext) => ext.toLowerCase())), [supported])
  const activeFile = files.find((file) => file.id === activeId) ?? files[0]

  const convertPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths)).filter((path) => isSupportedPath(path, supportedSet))
    if (uniquePaths.length === 0) {
      setError('No supported files were found.')
      return
    }

    setBusy(true)
    setError(null)
    const placeholders = uniquePaths.map((path) => ({
      id: path,
      path,
      name: fileNameFromPath(path),
      markdown: '',
      status: 'converting' as const,
    }))

    setFiles(placeholders)
    setActiveId(placeholders[0]?.id ?? '')

    const converted: PreviewFile[] = []
    for (const path of uniquePaths) {
      try {
        const result = await convertFile(path)
        converted.push({
          id: path,
          path,
          name: result.title ? `${result.title}.md` : fileNameFromPath(path),
          markdown: result.markdown,
          format: result.format,
          status: 'ready',
        })
      } catch (err) {
        converted.push({
          id: path,
          path,
          name: fileNameFromPath(path),
          markdown: '',
          status: 'error',
          error: String(err),
        })
      }
      setFiles([...converted, ...placeholders.slice(converted.length)])
    }
    setBusy(false)
  }, [supportedSet])

  const importPaths = useCallback(async (paths: string[]) => {
    const expanded: string[] = []
    for (const path of paths) {
      try {
        const entries = await readDir(path)
        if (entries.length > 0) {
          expanded.push(...await collectFiles(path, supportedSet))
          continue
        }
      } catch {
        /* path is probably a file */
      }
      expanded.push(path)
    }
    await convertPaths(expanded)
  }, [convertPaths, supportedSet])

  const handlePickFiles = useCallback(async () => {
    const picked = await openDialog({
      multiple: true,
      filters: [
        { name: 'Documents', extensions: supported },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (Array.isArray(picked) && picked.length > 0) {
      await importPaths(picked)
    } else if (typeof picked === 'string') {
      await importPaths([picked])
    }
  }, [importPaths, supported])

  const handlePickFolder = useCallback(async () => {
    const picked = await openDialog({ directory: true, multiple: false })
    if (typeof picked === 'string') {
      await importPaths([picked])
    }
  }, [importPaths])

  const handleMarkdownChange = (value: string) => {
    if (!activeFile) return
    setFiles((prev) =>
      prev.map((file) =>
        file.id === activeFile.id
          ? { ...file, markdown: value, status: 'ready', error: undefined }
          : file,
      ),
    )
  }

  const handleCopy = async () => {
    if (!activeFile?.markdown) return
    await navigator.clipboard.writeText(activeFile.markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSave = async () => {
    if (!activeFile?.markdown) return
    const target = await saveDialog({
      defaultPath: activeFile.name.endsWith('.md') ? activeFile.name : `${activeFile.name}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (target) {
      await writeTextFile(target, activeFile.markdown)
    }
  }

  const startSplitResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const container = mainRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const handleMove = (moveEvent: PointerEvent) => {
      const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(75, Math.max(25, pct))
      splitRef.current = clamped
      setSplitPct(clamped)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.localStorage.setItem('md-converter:split-pct', String(splitRef.current))
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }, [])

  return (
    <div className="mdc-bg flex h-screen flex-col overflow-hidden text-[var(--on-surface)]">
      <header className="mdc-panel m-3 mb-2 rounded-xl border px-4 py-3 text-[var(--on-surface)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--primary)]" />
              <h1 className="mdc-lux-text text-xl font-bold tracking-normal">Markdown Converter</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Convert files into Markdown, edit the result, and preview it live.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--on-surface)] hover:bg-white/[0.07] hover:text-[var(--text)]" onClick={handlePickFolder} disabled={busy}>
              <FolderOpen className="h-4 w-4" />
              Choose folder
            </Button>
            <Button variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--on-surface)] hover:bg-white/[0.07] hover:text-[var(--text)]" onClick={handlePickFiles} disabled={busy}>
              <FileText className="h-4 w-4" />
              Choose files
            </Button>
            <Button variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--on-surface)] hover:bg-white/[0.07] hover:text-[var(--text)]" onClick={handleCopy} disabled={!activeFile?.markdown}>
              <Copy className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="mdc-primary-button" onClick={handleSave} disabled={!activeFile?.markdown}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <AppearanceButton className="inline-flex size-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-[var(--on-surface)] transition-colors hover:bg-white/[0.07] hover:text-[var(--text)]" />
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div
            className={`rounded-xl border border-dashed px-4 py-3 text-sm transition ${
              dropActive
                ? 'border-[var(--primary)] bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] text-[var(--primary)]'
                : 'border-[var(--outline-variant)] bg-white/[0.025] text-[var(--on-surface-variant)]'
            }`}
          >
            Drop a file, several files, or a folder here. Supported: {supported.map((ext) => `.${ext}`).join('  ')}
          </div>

          <Select value={activeFile?.id ?? ''} onValueChange={setActiveId} disabled={files.length === 0}>
            <SelectTrigger className="h-11 border-white/10 bg-white/[0.045] text-[var(--on-surface)]">
              <SelectValue placeholder="No file selected" />
            </SelectTrigger>
            <SelectContent>
              {files.map((file) => (
                <SelectItem key={file.id} value={file.id}>
                  {file.status === 'error' ? 'Error: ' : ''}
                  {file.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </header>

      <main ref={mainRef} className="flex min-h-0 flex-1 px-3 pb-3">
        <section
          style={{ width: `${splitPct}%` }}
          className="mdc-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border"
        >
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--outline-variant)] px-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <PanelLeft className="h-4 w-4 text-[var(--primary)]" />
              Markdown
            </div>
            {activeFile?.status === 'converting' && (
              <span className="flex items-center gap-1 text-xs text-[var(--on-surface-variant)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Converting
              </span>
            )}
            {activeFile?.status === 'ready' && (
              <span className="flex items-center gap-1 text-xs text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            )}
          </div>

          {activeFile?.status === 'error' ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                {activeFile.error}
              </div>
            </div>
          ) : (
            <textarea
              value={activeFile?.markdown ?? ''}
              onChange={(event) => handleMarkdownChange(event.target.value)}
              placeholder="Converted Markdown will appear here."
              spellCheck={false}
              className="mdc-editor min-h-0 flex-1 resize-none border-0 bg-[color-mix(in_oklch,var(--bg)_58%,transparent)] p-5 font-mono text-sm leading-6 outline-none"
            />
          )}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize panels"
          onPointerDown={startSplitResize}
          className="group mx-1.5 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center"
        >
          <div className="h-10 w-1 rounded-full bg-[var(--outline-variant)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--primary)_55%,transparent)]" />
        </div>

        <section className="mdc-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--outline-variant)] px-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <PanelRight className="h-4 w-4 text-[var(--purple)]" />
              Markdown Preview
            </div>
            <span className="truncate text-xs text-[var(--on-surface-variant)]">
              {activeFile?.path ?? 'No source selected'}
            </span>
          </div>

          {activeFile?.markdown ? (
            <MarkdownDocument content={activeFile.markdown} fileName={activeFile.name} format="md" />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--on-surface-variant)]">
              Choose a file or folder to generate a live Markdown preview.
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

async function collectFiles(dir: string, supported: Set<string>): Promise<string[]> {
  const entries = await readDir(dir)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = await join(dir, entry.name)
    if (entry.isDirectory) {
      files.push(...await collectFiles(fullPath, supported))
    } else if (entry.isFile && isSupportedPath(fullPath, supported)) {
      files.push(fullPath)
    }
  }

  return files
}

function isSupportedPath(path: string, supported: Set<string>) {
  const ext = path.split('.').pop()?.toLowerCase()
  return !!ext && supported.has(ext)
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path
}
