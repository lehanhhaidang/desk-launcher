import { useRef, type ReactNode } from 'react'
import { ArrowUp, File as FileIcon, Folder, FolderPlus, RefreshCw } from 'lucide-react'
import type { SftpEntry } from '../api/myssh-api'

interface Props {
  title: string
  cwd: string
  entries: SftpEntry[]
  loading: boolean
  error: string | null
  selectedPath: string | null
  /** Single-click selects a row. */
  onSelect: (entry: SftpEntry) => void
  /** Double-click opens it (enter folder / preview file). */
  onOpen: (entry: SftpEntry) => void
  onUp: () => void
  onRefresh: () => void
  onNewFolder?: () => void
  /** Delete key removes the selected entry. */
  onDelete?: (entry: SftpEntry) => void
  /** Per-row action buttons (transfer …). */
  rowAction?: (entry: SftpEntry) => ReactNode
  rowDraggable?: boolean
  onRowDragStart?: (entry: SftpEntry, e: React.DragEvent) => void
  onPaneDrop?: (e: React.DragEvent) => void
}

export function FilePane({
  title,
  cwd,
  entries,
  loading,
  error,
  selectedPath,
  onSelect,
  onOpen,
  onUp,
  onRefresh,
  onNewFolder,
  onDelete,
  rowAction,
  rowDraggable,
  onRowDragStart,
  onPaneDrop,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="flex h-full min-w-0 flex-col"
      onDragOver={onPaneDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onPaneDrop}
    >
      <div className="flex items-center gap-1 border-b border-white/10 bg-black/20 px-2 py-1.5">
        <span className="mr-1 max-w-[40%] truncate text-xs font-semibold uppercase tracking-wider text-[#7c8797]">
          {title}
        </span>
        <button className="text-[#9aa6b6] hover:text-cyan-300" title="Up" onClick={onUp}>
          <ArrowUp className="size-4" />
        </button>
        <button className="text-[#9aa6b6] hover:text-cyan-300" title="Refresh" onClick={onRefresh}>
          <RefreshCw className="size-4" />
        </button>
        {onNewFolder && (
          <button className="text-[#9aa6b6] hover:text-cyan-300" title="New folder" onClick={onNewFolder}>
            <FolderPlus className="size-4" />
          </button>
        )}
        <div className="ml-1 min-w-0 flex-1 truncate rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-[#9aa6b6]">
          {cwd || '…'}
        </div>
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Delete' && selectedPath && onDelete) {
            const sel = entries.find((x) => x.path === selectedPath)
            if (sel) onDelete(sel)
          }
        }}
      >
        {error ? (
          <p className="px-3 py-6 text-center text-sm text-[#ffb4ab]">{error}</p>
        ) : loading ? (
          <p className="px-3 py-6 text-center text-sm text-[#7c8797]">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[#7c8797]">Empty folder.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              className={`group flex select-none items-center gap-2 px-2 py-1 ${
                selectedPath === entry.path ? 'bg-cyan-300/15' : 'hover:bg-white/[0.03]'
              }`}
              draggable={rowDraggable}
              onDragStart={onRowDragStart ? (e) => onRowDragStart(entry, e) : undefined}
              onClick={() => {
                onSelect(entry)
                listRef.current?.focus()
              }}
              onDoubleClick={() => onOpen(entry)}
            >
              {entry.isDir ? (
                <Folder className="size-4 shrink-0 text-cyan-300/80" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-[#7c8797]" />
              )}
              <span
                className={`min-w-0 flex-1 truncate text-sm ${entry.isDir ? 'text-cyan-100' : 'text-[#e6edf3]'}`}
                title={entry.name}
              >
                {entry.name}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-[#7c8797]">
                {entry.isDir ? '' : formatSize(entry.size)}
              </span>
              {rowAction && (
                <span
                  className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {rowAction(entry)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
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
