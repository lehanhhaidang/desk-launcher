import { useCallback, useEffect, useState } from 'react'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { Button, Card, CardContent, LoadingSpinner } from '@desk-launcher/ui'
import { convertFile } from '../api/md-api'
import type { ConvertResult } from '../types/md.types'

interface Props {
  supported: string[]
}

export function SingleTab({ supported }: Props) {
  const [isConverting, setIsConverting] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)

  const runConvert = useCallback(async (path: string) => {
    setIsConverting(true)
    setError(null)
    setResult(null)
    try {
      const res = await convertFile(path)
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsConverting(false)
    }
  }, [])

  const handlePick = useCallback(async () => {
    const path = await openDialog({
      multiple: false,
      filters: [
        { name: 'Documents', extensions: supported },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (typeof path === 'string') {
      runConvert(path)
    }
  }, [runConvert, supported])

  useEffect(() => {
    // Tauri delivers OS drag events at the window level; we still attach
    // dragover/drop handlers so the drop-zone styling reacts and webview
    // doesn't try to navigate to the dragged file.
    const prevent = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    // Subscribe to Tauri's native file-drop event so dropping anywhere in
    // the window triggers a convert.
    let unlisten: (() => void) | undefined
    ;(async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const wv = getCurrentWebview()
      const off = await wv.onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragOver(true)
        } else if (payload.type === 'leave') {
          setDragOver(false)
        } else if (payload.type === 'drop') {
          setDragOver(false)
          const first = payload.paths[0]
          if (first) runConvert(first)
        }
      })
      unlisten = off
    })()
    return () => {
      unlisten?.()
    }
  }, [runConvert])

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSave = async () => {
    if (!result) return
    const defaultName = (result.title || 'output') + '.md'
    try {
      setError(null)
      const target = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (target) {
        await writeTextFile(target, result.markdown)
      }
    } catch (e) {
      setError(`Save failed: ${String(e)}`)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="bg-card/60 backdrop-blur">
        <CardContent className="space-y-3 p-4">
          <div
            className={`flex h-44 items-center justify-center rounded-lg border-2 border-dashed text-center transition ${
              dragOver
                ? 'border-emerald-400 bg-emerald-400/10'
                : 'border-border/50 bg-muted/20'
            }`}
          >
            <div className="space-y-2 px-4">
              <p className="text-sm text-muted-foreground">
                Kéo thả file vào cửa sổ này
              </p>
              <p className="text-xs text-muted-foreground/70">hoặc</p>
              <Button size="sm" onClick={handlePick} disabled={isConverting}>
                Chọn file...
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Định dạng hỗ trợ:</p>
            <p className="font-mono leading-relaxed">
              {supported.map((s) => `.${s}`).join('  ')}
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-[400px] flex-col bg-card/60 backdrop-blur">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {result?.title || 'Chưa convert'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {result?.source_path || 'Chưa có file nào được chọn'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                disabled={!result}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!result}>
                Save as .md
              </Button>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden rounded-md border border-border/50 bg-background/50">
            {isConverting && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <LoadingSpinner />
              </div>
            )}
            <pre className="h-full overflow-auto p-3 text-xs leading-relaxed">
              {result?.markdown || (
                <span className="text-muted-foreground/60">
                  Markdown preview sẽ hiện ở đây sau khi convert.
                </span>
              )}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
