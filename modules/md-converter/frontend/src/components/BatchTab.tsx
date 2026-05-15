import { useCallback, useEffect, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Button, Card, CardContent } from '@desk-launcher/ui'
import { convertBatch } from '../api/md-api'
import type { BatchEntry } from '../types/md.types'

interface Props {
  supported: string[]
}

export function BatchTab({ supported }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [outputDir, setOutputDir] = useState<string>('')
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BatchEntry[]>([])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const wv = getCurrentWebview()
      const off = await wv.onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'drop') {
          const dropped = payload.paths
          setFiles((prev) => {
            const set = new Set(prev)
            for (const p of dropped) set.add(p)
            return [...set]
          })
        }
      })
      unlisten = off
    })()
    return () => {
      unlisten?.()
    }
  }, [])

  const handlePickFiles = useCallback(async () => {
    const picked = await openDialog({
      multiple: true,
      filters: [
        { name: 'Documents', extensions: supported },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (Array.isArray(picked) && picked.length > 0) {
      setFiles((prev) => {
        const set = new Set(prev)
        for (const p of picked) set.add(p)
        return [...set]
      })
    }
  }, [supported])

  const handlePickOutputDir = useCallback(async () => {
    const dir = await openDialog({ directory: true, multiple: false })
    if (typeof dir === 'string') {
      setOutputDir(dir)
    }
  }, [])

  const handleRun = useCallback(async () => {
    if (files.length === 0 || !outputDir) return
    setRunning(true)
    try {
      const res = await convertBatch({
        paths: files,
        output_dir: outputDir,
        overwrite,
      })
      setResults(res)
    } catch (e) {
      setResults([
        {
          source_path: '(batch error)',
          output_path: null,
          success: false,
          error: String(e),
        },
      ])
    } finally {
      setRunning(false)
    }
  }, [files, outputDir, overwrite])

  const successCount = results.filter((r) => r.success).length
  const failedCount = results.length - successCount

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="bg-card/60 backdrop-blur">
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Input files</p>
              <span className="text-xs text-muted-foreground">
                {files.length} file
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePickFiles}>
                Add files...
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFiles([])}
                disabled={files.length === 0}
              >
                Clear
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Hoặc kéo thả nhiều file vào cửa sổ.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Output folder</p>
            <Button size="sm" variant="outline" onClick={handlePickOutputDir}>
              {outputDir ? 'Change folder...' : 'Choose folder...'}
            </Button>
            {outputDir && (
              <p
                className="mt-2 break-all rounded border border-border/40 bg-muted/30 p-2 font-mono text-xs"
                title={outputDir}
              >
                {outputDir}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            <span>Ghi đè file cũ (mặc định thêm -1, -2)</span>
          </label>

          <Button
            className="w-full"
            disabled={files.length === 0 || !outputDir || running}
            onClick={handleRun}
          >
            {running
              ? 'Converting...'
              : `Convert ${files.length || ''} file → Markdown`}
          </Button>
        </CardContent>
      </Card>

      <Card className="flex min-h-[400px] flex-col bg-card/60 backdrop-blur">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Queue & Results</p>
            {results.length > 0 && (
              <p className="text-xs">
                <span className="text-emerald-400">✓ {successCount}</span>
                {failedCount > 0 && (
                  <span className="ml-2 text-red-400">✗ {failedCount}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto rounded-md border border-border/50 bg-background/50">
            {results.length === 0 && files.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground/60">
                Chưa có file nào. Thêm file rồi nhấn Convert.
              </div>
            )}

            {results.length === 0 && files.length > 0 && (
              <ul className="divide-y divide-border/30">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <span className="truncate font-mono" title={f}>
                      {f}
                    </span>
                    <button
                      className="ml-2 shrink-0 text-muted-foreground hover:text-red-400"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {results.length > 0 && (
              <ul className="divide-y divide-border/30">
                {results.map((r, i) => (
                  <li key={i} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          r.success ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        {r.success ? '✓' : '✗'}
                      </span>
                      <span className="truncate font-mono" title={r.source_path}>
                        {r.source_path}
                      </span>
                    </div>
                    {r.output_path && (
                      <p
                        className="ml-5 truncate text-muted-foreground"
                        title={r.output_path}
                      >
                        → {r.output_path}
                      </p>
                    )}
                    {r.error && (
                      <p className="ml-5 text-red-400/80">{r.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
