import { useRef, useState, type ReactNode } from 'react'
import { ArrowUp, File as FileIcon, Folder, FolderPlus, Pencil, RefreshCw } from 'lucide-react'
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
  /** Navigate to a typed absolute path. */
  onNavigatePath: (path: string) => void
  onUp: () => void
  onRefresh: () => void
  onNewFolder?: () => void
  /** Delete key removes the selected entry. */
  onDelete?: (entry: SftpEntry) => void
  /** Rename (F2 or the pencil button). */
  onRename?: (entry: SftpEntry, newName: string) => void
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
  onNavigatePath,
  onUp,
  onRefresh,
  onNewFolder,
  onDelete,
  onRename,
  rowAction,
  rowDraggable,
  onRowDragStart,
  onPaneDrop,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [editingPath, setEditingPath] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const startRename = (entry: SftpEntry) => {
    setRenamingPath(entry.path)
    setRenameDraft(entry.name)
  }
  const commitRename = (entry: SftpEntry) => {
    const name = renameDraft.trim()
    setRenamingPath(null)
    if (name && name !== entry.name) onRename?.(entry, name)
  }

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
        {editingPath ? (
          <input
            autoFocus
            className="ml-1 min-w-0 flex-1 rounded bg-black/30 px-2 py-1 font-mono text-[11px] text-[#edf3f7] outline-none"
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onNavigatePath(pathDraft.trim())
                setEditingPath(false)
              }
              if (e.key === 'Escape') setEditingPath(false)
            }}
            onBlur={() => setEditingPath(false)}
          />
        ) : (
          <div
            className="ml-1 min-w-0 flex-1 cursor-text truncate rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-[#9aa6b6] hover:text-[#c9d4e0]"
            title="Click to type a path"
            onClick={() => {
              setPathDraft(cwd)
              setEditingPath(true)
            }}
          >
            {cwd || '…'}
          </div>
        )}
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none"
        onKeyDown={(e) => {
          const sel = selectedPath ? entries.find((x) => x.path === selectedPath) : undefined
          if (e.key === 'Delete' && sel && onDelete) onDelete(sel)
          if (e.key === 'F2' && sel && onRename) startRename(sel)
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
              {renamingPath === entry.path ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded bg-black/30 px-1 text-sm text-[#edf3f7] outline-none"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={() => commitRename(entry)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename(entry)
                    if (e.key === 'Escape') setRenamingPath(null)
                  }}
                />
              ) : (
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${entry.isDir ? 'text-cyan-100' : 'text-[#e6edf3]'}`}
                  title={entry.name}
                >
                  {entry.name}
                </span>
              )}
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-[#7c8797]">
                {entry.isDir ? '' : formatSize(entry.size)}
              </span>
              {(rowAction || onRename) && (
                <span
                  className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {rowAction?.(entry)}
                  {onRename && (
                    <button
                      className="text-[#9aa6b6] hover:text-[#edf3f7]"
                      title="Rename (F2)"
                      onClick={() => startRename(entry)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
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
