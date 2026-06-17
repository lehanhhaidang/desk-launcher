import type { ReactNode } from 'react'
import { ArrowUp, File as FileIcon, Folder, FolderPlus, RefreshCw } from 'lucide-react'
import type { SftpEntry } from '../api/myssh-api'

interface Props {
  title: string
  cwd: string
  entries: SftpEntry[]
  loading: boolean
  error: string | null
  onNavigate: (path: string) => void
  onUp: () => void
  onRefresh: () => void
  onNewFolder?: () => void
  onFileOpen?: (entry: SftpEntry) => void
  /** Direction-specific row actions (upload / download / delete …). */
  rowAction?: (entry: SftpEntry) => ReactNode
  /** Drag source/target wiring for the WinSCP-style transfer (added later). */
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
  onNavigate,
  onUp,
  onRefresh,
  onNewFolder,
  onFileOpen,
  rowAction,
  rowDraggable,
  onRowDragStart,
  onPaneDrop,
}: Props) {
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

      <div className="flex-1 overflow-y-auto">
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
              className="group flex items-center gap-2 px-2 py-1 hover:bg-white/[0.03]"
              draggable={rowDraggable && !entry.isDir}
              onDragStart={onRowDragStart ? (e) => onRowDragStart(entry, e) : undefined}
            >
              {entry.isDir ? (
                <Folder className="size-4 shrink-0 text-cyan-300/80" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-[#7c8797]" />
              )}
              <button
                className={`min-w-0 flex-1 truncate text-left text-sm ${entry.isDir ? 'text-cyan-100' : 'text-[#e6edf3]'}`}
                onClick={() => (entry.isDir ? onNavigate(entry.path) : onFileOpen?.(entry))}
                title={entry.name}
              >
                {entry.name}
              </button>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-[#7c8797]">
                {entry.isDir ? '' : formatSize(entry.size)}
              </span>
              <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                {rowAction?.(entry)}
              </span>
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
