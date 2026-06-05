import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { getCurrentWebview } from '@tauri-apps/api/webview'

interface DropZoneProps {
  /** Lower-case extensions accepted, e.g. `['png', 'jpg', 'webp']`. */
  accept: string[]
  /** Called with the absolute paths the user dropped or picked. */
  onAccept: (paths: string[]) => void
  /** Called when the user opens the file picker. */
  onPick: () => void
  title: string
  description?: string
  icon: ReactNode
  /**
   * Active state — when false, the zone still renders but ignores Tauri drag
   * events. Use this so the active tab is the only one consuming drops.
   */
  active: boolean
}

/**
 * Tauri-aware drop zone. HTML5 drag/drop is overridden by Tauri 2's native
 * file-drop integration, so we listen to the webview's drag/drop event and
 * filter paths by extension. Click-to-browse is left to the caller (it opens
 * the Tauri dialog plugin), keeping this component dialog-agnostic.
 */
export function DropZone({
  accept,
  onAccept,
  onPick,
  title,
  description,
  icon,
  active,
}: DropZoneProps) {
  const [hover, setHover] = useState(false)

  const filterPaths = useCallback(
    (paths: string[]) => {
      const allow = new Set(accept.map((e) => e.toLowerCase()))
      return paths.filter((p) => {
        const dot = p.lastIndexOf('.')
        if (dot === -1) return false
        return allow.has(p.slice(dot + 1).toLowerCase())
      })
    },
    [accept],
  )

  useEffect(() => {
    if (!active) {
      setHover(false)
      return
    }
    let disposed = false
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (disposed) return
      const { payload } = event
      if (payload.type === 'over') {
        setHover(true)
      } else if (payload.type === 'leave') {
        setHover(false)
      } else if (payload.type === 'drop') {
        setHover(false)
        const matched = filterPaths(payload.paths)
        if (matched.length > 0) onAccept(matched)
      }
    })
    return () => {
      disposed = true
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [active, filterPaths, onAccept])

  return (
    <div
      className="vd-drop-zone"
      data-active={hover ? 'true' : undefined}
    >
      <div className="vd-drop-icon">{icon}</div>
      <div className="min-w-0">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <button type="button" className="vd-upload-button" onClick={onPick}>
        <Upload className="size-4" />
        <span>Choose files</span>
      </button>
    </div>
  )
}
