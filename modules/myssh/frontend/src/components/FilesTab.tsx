import { useEffect, useRef, useState } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { FilePane } from './FilePane'
import {
  localList,
  localHome,
  sftpClose,
  sftpDownload,
  sftpList,
  sftpMkdir,
  sftpOpen,
  sftpRemove,
  sftpUpload,
  type SftpEntry,
} from '../api/myssh-api'

interface Props {
  hostId: string
  hostLabel: string
  active: boolean
  /** Ask the workspace to open a preview tab for a file. */
  onPreview?: (file: { origin: 'local' | 'remote'; path: string; name: string; sftpId?: string }) => void
}

type DragPayload = { origin: 'local' | 'remote'; path: string; name: string }

export function FilesTab({ hostId, hostLabel, onPreview }: Props) {
  const [sftpId, setSftpId] = useState<string | null>(null)
  const [remoteCwd, setRemoteCwd] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<SftpEntry[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  const [localCwd, setLocalCwd] = useState('')
  const [localEntries, setLocalEntries] = useState<SftpEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [splitPct, setSplitPct] = useState(50)
  const [newFolder, setNewFolder] = useState('')
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragPayload | null>(null)
  const sftpIdRef = useRef<string | null>(null)
  const remoteCwdRef = useRef('/')
  const localCwdRef = useRef('')

  useEffect(() => {
    let cancelled = false
    let openedId: string | null = null
    sftpOpen(hostId)
      .then(async ({ sftpId: id, home }) => {
        if (cancelled) {
          sftpClose(id).catch(() => {})
          return
        }
        openedId = id
        sftpIdRef.current = id
        setSftpId(id)
        await reloadRemote(id, home)
      })
      .catch((e) => setRemoteError(errMessage(e)))
    localHome()
      .then((h) => reloadLocal(h))
      .catch((e) => setLocalError(errMessage(e)))
    return () => {
      cancelled = true
      if (openedId) sftpClose(openedId).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  const reloadRemote = async (id: string, path: string) => {
    setRemoteLoading(true)
    try {
      const list = await sftpList(id, path)
      setRemoteEntries(list)
      setRemoteCwd(path)
      remoteCwdRef.current = path
      setRemoteError(null)
    } catch (e) {
      setRemoteError(errMessage(e))
    } finally {
      setRemoteLoading(false)
    }
  }
  const reloadLocal = async (path: string) => {
    setLocalLoading(true)
    try {
      const list = await localList(path)
      setLocalEntries(list)
      setLocalCwd(path)
      localCwdRef.current = path
      setLocalError(null)
    } catch (e) {
      setLocalError(errMessage(e))
    } finally {
      setLocalLoading(false)
    }
  }
  const refreshRemote = () => sftpIdRef.current && reloadRemote(sftpIdRef.current, remoteCwdRef.current)
  const refreshLocal = () => reloadLocal(localCwdRef.current)

  const upload = async (payload: DragPayload) => {
    const id = sftpIdRef.current
    if (!id) return
    try {
      await sftpUpload(id, payload.path, joinRemote(remoteCwdRef.current, payload.name))
      toast.success(`Uploaded ${payload.name}`)
      refreshRemote()
    } catch (e) {
      toast.error(`Upload failed: ${errMessage(e)}`)
    }
  }
  const download = async (payload: DragPayload) => {
    const id = sftpIdRef.current
    if (!id) return
    try {
      await sftpDownload(id, payload.path, joinLocal(localCwdRef.current, payload.name))
      toast.success(`Downloaded ${payload.name}`)
      refreshLocal()
    } catch (e) {
      toast.error(`Download failed: ${errMessage(e)}`)
    }
  }

  const removeRemote = async (entry: SftpEntry) => {
    const id = sftpIdRef.current
    if (!id) return
    const ok = await confirm(`Delete "${entry.name}"?`, { title: 'Delete', kind: 'warning' })
    if (!ok) return
    try {
      await sftpRemove(id, entry.path, entry.isDir)
      refreshRemote()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }
  const submitNewFolder = async () => {
    const id = sftpIdRef.current
    const name = newFolder.trim()
    if (!name || !id) {
      setNewFolderOpen(false)
      return
    }
    try {
      await sftpMkdir(id, joinRemote(remoteCwdRef.current, name))
      setNewFolder('')
      setNewFolderOpen(false)
      refreshRemote()
    } catch (e) {
      toast.error(`Create folder failed: ${errMessage(e)}`)
    }
  }

  const onDrop = (target: 'local' | 'remote') => {
    const payload = drag.current
    drag.current = null
    if (!payload || payload.origin === target) return
    if (target === 'remote') upload(payload)
    else download(payload)
  }

  // Splitter drag.
  const startSplit = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const move = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(80, Math.max(20, pct)))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const dragStart = (origin: 'local' | 'remote') => (entry: SftpEntry, e: React.DragEvent) => {
    drag.current = { origin, path: entry.path, name: entry.name }
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', entry.name)
  }

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {/* Local pane */}
      <div style={{ width: `${splitPct}%` }} className="min-w-0">
        <FilePane
          title="Local"
          cwd={localCwd}
          entries={localEntries}
          loading={localLoading}
          error={localError}
          onNavigate={reloadLocal}
          onUp={() => reloadLocal(parentLocal(localCwd))}
          onRefresh={refreshLocal}
          onFileOpen={(e) => onPreview?.({ origin: 'local', path: e.path, name: e.name })}
          rowDraggable
          onRowDragStart={dragStart('local')}
          onPaneDrop={(e) => {
            e.preventDefault()
            onDrop('local')
          }}
          rowAction={(e) =>
            !e.isDir && (
              <button
                className="text-[#9aa6b6] hover:text-cyan-300"
                title="Upload to remote →"
                onClick={() => upload({ origin: 'local', path: e.path, name: e.name })}
              >
                <ArrowRight className="size-3.5" />
              </button>
            )
          }
        />
      </div>

      <div
        onMouseDown={startSplit}
        className="w-1 shrink-0 cursor-col-resize bg-white/10 transition hover:bg-cyan-300/40"
      />

      {/* Remote pane */}
      <div style={{ width: `${100 - splitPct}%` }} className="flex min-w-0 flex-col">
        {newFolderOpen && (
          <input
            autoFocus
            className="border-b border-cyan-300/30 bg-white/[0.05] px-3 py-1.5 text-sm outline-none"
            placeholder="Folder name, Enter to create"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onBlur={submitNewFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewFolder()
              if (e.key === 'Escape') {
                setNewFolder('')
                setNewFolderOpen(false)
              }
            }}
          />
        )}
        <div className="min-h-0 flex-1">
          <FilePane
            title={hostLabel}
            cwd={remoteCwd}
            entries={remoteEntries}
            loading={remoteLoading}
            error={remoteError}
            onNavigate={(p) => sftpIdRef.current && reloadRemote(sftpIdRef.current, p)}
            onUp={() => sftpIdRef.current && reloadRemote(sftpIdRef.current, parentRemote(remoteCwd))}
            onRefresh={refreshRemote}
            onNewFolder={() => setNewFolderOpen(true)}
            onFileOpen={(e) =>
              onPreview?.({ origin: 'remote', path: e.path, name: e.name, sftpId: sftpId ?? undefined })
            }
            rowDraggable
            onRowDragStart={dragStart('remote')}
            onPaneDrop={(e) => {
              e.preventDefault()
              onDrop('remote')
            }}
            rowAction={(e) => (
              <>
                {!e.isDir && (
                  <button
                    className="text-[#9aa6b6] hover:text-cyan-300"
                    title="← Download to local"
                    onClick={() => download({ origin: 'remote', path: e.path, name: e.name })}
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                )}
                <button
                  className="text-[#9aa6b6] hover:text-[#ffb4ab]"
                  title="Delete"
                  onClick={() => removeRemote(e)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          />
        </div>
      </div>
    </div>
  )
}

function joinRemote(dir: string, name: string): string {
  if (dir === '/' || dir === '') return `/${name}`
  return `${dir.replace(/\/+$/, '')}/${name}`
}
function parentRemote(p: string): string {
  if (p === '/' || p === '') return '/'
  const t = p.replace(/\/+$/, '')
  const idx = t.lastIndexOf('/')
  return idx <= 0 ? '/' : t.slice(0, idx)
}
function joinLocal(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}\\${name}`
}
function parentLocal(p: string): string {
  const t = p.replace(/[\\/]+$/, '')
  const idx = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'))
  if (idx < 0) return p
  let parent = t.slice(0, idx)
  if (/^[A-Za-z]:$/.test(parent)) parent += '\\'
  return parent || '\\'
}
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
