import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import {
  createSnippet,
  deleteSnippet,
  listSnippets,
  updateSnippet,
  type Snippet,
} from '../api/myssh-api'

interface Props {
  open: boolean
  onClose: () => void
  /** Send a snippet's command to the active session. */
  onRun: (command: string) => void
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#edf3f7] outline-none transition focus:border-cyan-300/40'

export function SnippetsPanel({ open, onClose, onRun }: Props) {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')

  const refresh = () => {
    listSnippets()
      .then(setSnippets)
      .catch((e) => toast.error(`Failed to load snippets: ${errMessage(e)}`))
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  if (!open) return null

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setCommand('')
  }

  const startEdit = (s: Snippet) => {
    setEditingId(s.id)
    setName(s.name)
    setCommand(s.command)
  }

  const save = async () => {
    if (!name.trim() || !command.trim()) {
      toast.error('Name and command are required')
      return
    }
    try {
      if (editingId) await updateSnippet(editingId, { name: name.trim(), command })
      else await createSnippet({ name: name.trim(), command })
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
          <h2 className="text-lg font-semibold text-[#edf3f7]">Snippets</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {snippets.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#7c8797]">No snippets yet.</p>
          ) : (
            snippets.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="truncate font-mono text-xs text-[#7c8797]">{s.command}</div>
                </div>
                <button
                  className="text-[#9aa6b6] transition hover:text-cyan-300"
                  title="Run on active session"
                  onClick={() => onRun(s.command)}
                >
                  <Play className="size-4" />
                </button>
                <button
                  className="text-[#9aa6b6] transition hover:text-[#edf3f7]"
                  title="Edit"
                  onClick={() => startEdit(s)}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  className="text-[#9aa6b6] transition hover:text-[#ffb4ab]"
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
