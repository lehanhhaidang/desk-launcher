import { useEffect, useState } from 'react'
import { onTransfer, type TransferProgress } from '../api/myssh-api'

/** Bottom-right list of active file transfers with progress bars. Mount once. */
export function TransfersOverlay() {
  const [items, setItems] = useState<Record<string, TransferProgress>>({})

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    onTransfer((t) => {
      setItems((m) => ({ ...m, [t.id]: t }))
      if (t.done) {
        // Keep errors visible a bit longer, then auto-dismiss.
        window.setTimeout(
          () =>
            setItems((m) => {
              const next = { ...m }
              delete next[t.id]
              return next
            }),
          t.error ? 6000 : 1500,
        )
      }
    }).then((u) => {
      if (disposed) u()
      else unlisten = u
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const list = Object.values(items)
  if (list.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
      {list.map((t) => {
        const pct = t.total > 0 ? Math.min(100, Math.round((t.transferred / t.total) * 100)) : t.done ? 100 : 0
        return (
          <div key={t.id} className="myssh-panel rounded-lg border p-3 shadow-xl">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-[#edf3f7]" title={t.name}>
                {t.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-[#7c8797]">
                {t.error ? 'failed' : t.done ? 'done' : `${pct}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all ${t.error ? 'bg-[#ffb4ab]' : 'bg-cyan-300'}`}
                style={{ width: `${t.error ? 100 : pct}%` }}
              />
            </div>
            {t.error && <p className="mt-1 truncate text-[11px] text-[#ffb4ab]">{t.error}</p>}
          </div>
        )
      })}
    </div>
  )
}
