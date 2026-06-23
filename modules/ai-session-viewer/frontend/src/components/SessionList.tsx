import { useState } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Check, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import { Input, LoadingSpinner } from '@desk-launcher/ui'
import type { SessionEntry } from '../types'
import { formatUnix } from '../format'

interface Props {
  sessions: SessionEntry[]
  activePath: string | null
  loading: boolean
  onSelect: (session: SessionEntry) => void
  onRename: (session: SessionEntry, newName: string) => void
  onDelete: (session: SessionEntry) => void
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What to show as the row's primary label. */
function primaryLabel(session: SessionEntry): string {
  // A renamed file (non-UUID stem) is the user's chosen name → show it.
  if (!UUID_RE.test(session.id)) return session.id
  // Otherwise prefer the generated title, falling back to the id.
  return session.title?.trim() || session.id
}

export function SessionList({
  sessions,
  activePath,
  loading,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function startRename(session: SessionEntry) {
    setRenamingPath(session.path)
    setRenameValue(UUID_RE.test(session.id) ? session.title?.trim() || session.id : session.id)
  }

  function commitRename(session: SessionEntry) {
    const next = renameValue.trim()
    if (next) onRename(session, next)
    setRenamingPath(null)
  }

  async function handleDelete(session: SessionEntry) {
    const ok = await confirm(
      `Delete this session file?\n\n${primaryLabel(session)}\n\nThis permanently removes the .jsonl file from disk.`,
      { title: 'Delete session', kind: 'warning' },
    )
    if (ok) onDelete(session)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-[var(--text-muted)]">
        <LoadingSpinner size="sm" /> Loading sessions…
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <p className="px-1 py-4 text-xs text-[var(--text-muted)]">
        Select a project to see its sessions.
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {sessions.map((session) => {
        const active = session.path === activePath
        const label = primaryLabel(session)
        const renaming = session.path === renamingPath

        if (renaming) {
          return (
            <li key={session.path} className="px-1 py-1">
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={renameValue}
                  spellCheck={false}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(session)
                    if (e.key === 'Escape') setRenamingPath(null)
                  }}
                  className="h-7 text-xs"
                />
                <button
                  type="button"
                  title="Save"
                  onClick={() => commitRename(session)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Cancel"
                  onClick={() => setRenamingPath(null)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        }

        return (
          <li key={session.path} className="group/session">
            <div
              className={[
                'flex items-center gap-1 rounded-md pr-1 transition-colors',
                active ? 'bg-[var(--brand)]/15' : 'hover:bg-[var(--panel-2)]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onSelect(session)}
                title={label}
                className={[
                  'flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left text-xs',
                  active ? 'text-[var(--text)]' : 'text-[var(--text-muted)] group-hover/session:text-[var(--text)]',
                ].join(' ')}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 overflow-hidden">
                  <span className="block truncate">{label}</span>
                  <span className="block text-[10px] opacity-60">
                    {formatUnix(session.lastModified)}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/session:opacity-100">
                <button
                  type="button"
                  title="Rename"
                  onClick={() => startRename(session)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => handleDelete(session)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[#ffb4ab]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
