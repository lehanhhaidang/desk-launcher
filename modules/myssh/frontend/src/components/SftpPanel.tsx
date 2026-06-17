import { useEffect, useState } from 'react'
import { confirm, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import {
  ArrowUp,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import {
  sftpClose,
  sftpDownload,
  sftpList,
  sftpMkdir,
  sftpOpen,
  sftpRemove,
  sftpRename,
  sftpUpload,
  type Host,
  type SftpEntry,
} from '../api/myssh-api'

interface Props {
  open: boolean
  host: Host | null
  onClose: () => void
}

export function SftpPanel({ open, host, onClose }: Props) {
  const [sftpId, setSftpId] = useState<string | null>(null)
  const [cwd, setCwd] = useState('/')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  useEffect(() => {
    if (!open || !host) return
    let cancelled = false
    let openedId: string | null = null
    setLoading(true)
    setError(null)
    setEntries([])
    sftpOpen(host.id)
      .then(async ({ sftpId: id, home }) => {
        if (cancelled) {
          sftpClose(id).catch(() => {})
          return
        }
        openedId = id
        setSftpId(id)
        try {
          const list = await sftpList(id, home)
          if (!cancelled) {
            setEntries(list)
            setCwd(home)
          }
        } catch (e) {
          if (!cancelled) setError(errMessage(e))
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (openedId) sftpClose(openedId).catch(() => {})
      setSftpId(null)
      setCwd('/')
      setEntries([])
      setNewFolderOpen(false)
      setEditingPath(null)
    }
  }, [open, host])

  if (!open || !host) return null

  const navigate = async (path: string) => {
    if (!sftpId) return
    setLoading(true)
    setError(null)
    try {
      const list = await sftpList(sftpId, path)
      setEntries(list)
      setCwd(path)
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setLoading(false)
    }
  }
  const reload = () => navigate(cwd)

  const download = async (entry: SftpEntry) => {
    if (!sftpId) return
    const local = await saveDialog({ defaultPath: entry.name })
    if (!local) return
    try {
      await sftpDownload(sftpId, entry.path, local)
      toast.success(`Downloaded ${entry.name}`)
    } catch (e) {
      toast.error(`Download failed: ${errMessage(e)}`)
    }
  }

  const upload = async () => {
    if (!sftpId) return
    const local = await openDialog({ multiple: false, directory: false })
    if (typeof local !== 'string') return
    const name = basename(local)
    try {
      await sftpUpload(sftpId, local, joinPath(cwd, name))
      toast.success(`Uploaded ${name}`)
      reload()
    } catch (e) {
      toast.error(`Upload failed: ${errMessage(e)}`)
    }
  }

  const submitNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name || !sftpId) {
      setNewFolderOpen(false)
      return
    }
    try {
      await sftpMkdir(sftpId, joinPath(cwd, name))
      setNewFolderName('')
      setNewFolderOpen(false)
      reload()
    } catch (e) {
      toast.error(`Create folder failed: ${errMessage(e)}`)
    }
  }

  const remove = async (entry: SftpEntry) => {
    if (!sftpId) return
    const ok = await confirm(`Delete "${entry.name}"?`, { title: 'Delete', kind: 'warning' })
    if (!ok) return
    try {
      await sftpRemove(sftpId, entry.path, entry.isDir)
      reload()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }

  const commitRename = async (entry: SftpEntry) => {
    const name = renameDraft.trim()
    setEditingPath(null)
    if (!name || name === entry.name || !sftpId) return
    try {
      await sftpRename(sftpId, entry.path, joinPath(cwd, name))
      reload()
    } catch (e) {
      toast.error(`Rename failed: ${errMessage(e)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel flex h-[82vh] w-full max-w-3xl flex-col rounded-xl border p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#edf3f7]">
            Files <span className="text-sm font-normal text-[#7c8797]">— {host.label}</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Toolbar */}
        <div className="mb-2 flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" title="Up" onClick={() => navigate(parentPath(cwd))}>
            <ArrowUp className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="Refresh" onClick={reload}>
            <RefreshCw className="size-4" />
          </Button>
          <div className="mx-2 min-w-0 flex-1 truncate rounded-md bg-black/20 px-3 py-1.5 font-mono text-xs text-[#9aa6b6]">
            {cwd}
          </div>
          <Button size="sm" variant="ghost" title="New folder" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" title="Upload" onClick={upload}>
            <Upload className="size-4" /> Upload
          </Button>
        </div>

        {newFolderOpen && (
          <input
            autoFocus
            className="mb-2 w-full rounded-md border border-cyan-300/30 bg-white/[0.05] px-3 py-1.5 text-sm outline-none"
            placeholder="Folder name, Enter to create"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={submitNewFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewFolder()
              if (e.key === 'Escape') {
                setNewFolderName('')
                setNewFolderOpen(false)
              }
            }}
          />
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-white/10">
          {error ? (
            <p className="px-4 py-6 text-center text-sm text-[#ffb4ab]">{error}</p>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-[#7c8797]">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#7c8797]">Empty folder.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                className="group flex items-center gap-3 border-b border-white/5 px-3 py-1.5 last:border-0 hover:bg-white/[0.03]"
              >
                {entry.isDir ? (
                  <Folder className="size-4 shrink-0 text-cyan-300/80" />
                ) : (
                  <FileIcon className="size-4 shrink-0 text-[#7c8797]" />
                )}
                {editingPath === entry.path ? (
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-sm outline-none"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(entry)
                      if (e.key === 'Escape') setEditingPath(null)
                    }}
                  />
                ) : (
                  <button
                    className={`min-w-0 flex-1 truncate text-left text-sm ${entry.isDir ? 'text-cyan-100' : 'text-[#e6edf3]'}`}
                    onClick={() => entry.isDir && navigate(entry.path)}
                    title={entry.isDir ? 'Open' : entry.name}
                  >
                    {entry.name}
                    {entry.isSymlink && <span className="ml-1 text-[10px] text-[#7c8797]">↗</span>}
                  </button>
                )}
                <span className="w-20 shrink-0 text-right font-mono text-xs text-[#7c8797]">
                  {entry.isDir ? '' : formatSize(entry.size)}
                </span>
                <span className="w-32 shrink-0 text-right text-[11px] text-[#5f6b7a]">
                  {formatTime(entry.modified)}
                </span>
                <span className="flex w-20 shrink-0 justify-end gap-1.5 opacity-0 transition group-hover:opacity-100">
                  {!entry.isDir && (
                    <button className="text-[#9aa6b6] hover:text-cyan-300" title="Download" onClick={() => download(entry)}>
                      <Download className="size-3.5" />
                    </button>
                  )}
                  <button
                    className="text-[#9aa6b6] hover:text-[#edf3f7]"
                    title="Rename"
                    onClick={() => {
                      setEditingPath(entry.path)
                      setRenameDraft(entry.name)
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button className="text-[#9aa6b6] hover:text-[#ffb4ab]" title="Delete" onClick={() => remove(entry)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function joinPath(dir: string, name: string): string {
  if (dir === '/' || dir === '') return `/${name}`
  return `${dir.replace(/\/+$/, '')}/${name}`
}
function parentPath(p: string): string {
  if (p === '/' || p === '') return '/'
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}
function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
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
function formatTime(modified: number | null): string {
  if (modified == null) return ''
  return new Date(modified * 1000).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
