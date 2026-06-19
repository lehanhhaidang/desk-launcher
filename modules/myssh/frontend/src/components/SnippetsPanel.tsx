import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import {
  createSnippet,
  deleteSnippet,
  listSnippets,
  updateSnippet,
  type Host,
  type Snippet,
} from '../api/myssh-api'

interface Props {
  open: boolean
  onClose: () => void
  /** Send a snippet's command to the active session. */
  onRun: (command: string) => void
  hosts: Host[]
  /** Pre-select this host in the add form (when opened from a host terminal). */
  defaultHostId?: string | null
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[color-mix(in_oklch,var(--brand)_40%,transparent)]'

export function SnippetsPanel({ open, onClose, onRun, hosts, defaultHostId = null }: Props) {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [hostId, setHostId] = useState<string | null>(defaultHostId)

  const refresh = () => {
    listSnippets()
      .then(setSnippets)
      .catch((e) => toast.error(`Failed to load snippets: ${errMessage(e)}`))
  }

  useEffect(() => {
    if (open) {
      refresh()
      setHostId(defaultHostId)
    }
  }, [open, defaultHostId])

  if (!open) return null

  const hostName = (id: string | null) =>
    id == null ? 'All hosts' : hosts.find((h) => h.id === id)?.label ?? 'Unknown host'

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setCommand('')
    setHostId(defaultHostId)
  }

  const startEdit = (s: Snippet) => {
    setEditingId(s.id)
    setName(s.name)
    setCommand(s.command)
    setHostId(s.hostId)
  }

  const save = async () => {
    if (!name.trim() || !command.trim()) {
      toast.error('Name and command are required')
      return
    }
    try {
      if (editingId) await updateSnippet(editingId, { name: name.trim(), command, hostId })
      else await createSnippet({ name: name.trim(), command, hostId })
      resetForm()
      refresh()
    } catch (e) {
      toast.error(`Save failed: ${errMessage(e)}`)
    }
  }

  const remove = async (s: Snippet) => {
    try {
      await deleteSnippet(s.id)
      if (editingId === s.id) resetForm()
      refresh()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Snippets</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {snippets.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-faint)]">No snippets yet.</p>
          ) : (
            snippets.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                      {hostName(s.hostId)}
                    </span>
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--text-faint)]">{s.command}</div>
                </div>
                <button
                  className="text-[var(--text-muted)] transition hover:text-[var(--brand)]"
                  title="Run on active session"
                  onClick={() => onRun(s.command)}
                >
                  <Play className="size-4" />
                </button>
                <button
                  className="text-[var(--text-muted)] transition hover:text-[var(--text)]"
                  title="Edit"
                  onClick={() => startEdit(s)}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  className="text-[var(--text-muted)] transition hover:text-[#ffb4ab]"
                  title="Delete"
                  onClick={() => remove(s)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <select
            className={inputClass}
            value={hostId ?? ''}
            onChange={(e) => setHostId(e.target.value || null)}
          >
            <option value="">All hosts</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="Snippet name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={`${inputClass} min-h-20 font-mono`}
            placeholder="Command to run"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
            <Button onClick={save}>
              {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editingId ? 'Save snippet' : 'Add snippet'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
