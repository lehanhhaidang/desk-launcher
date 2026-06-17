import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Code2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Unplug,
} from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import { HostDialog } from './components/HostDialog'
import { SnippetsPanel } from './components/SnippetsPanel'
import { ForwardsPanel } from './components/ForwardsPanel'
import { KnownHostsPanel } from './components/KnownHostsPanel'
import { HostKeyModal } from './components/HostKeyModal'
import { Workspace, type WorkspaceTab } from './components/Workspace'
import type { ConnStatus } from './terminal/TerminalView'
import {
  createGroup,
  deleteGroup,
  deleteHost,
  listForwards,
  listGroups,
  listHosts,
  sendInput,
  startForward,
  type Group,
  type Host,
} from './api/myssh-api'

const encoder = new TextEncoder()

export default function MySSH() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Host | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [tabStatus, setTabStatus] = useState<Record<string, ConnStatus>>({})
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [snippetsOpen, setSnippetsOpen] = useState(false)
  const [forwardsOpen, setForwardsOpen] = useState(false)
  const [knownHostsOpen, setKnownHostsOpen] = useState(false)
  const sessionMap = useRef<Map<string, string>>(new Map())

  const registerSession = useCallback((tabKey: string, sessionId: string | null) => {
    if (sessionId) sessionMap.current.set(tabKey, sessionId)
    else sessionMap.current.delete(tabKey)
  }, [])

  const registerStatus = useCallback((tabKey: string, status: ConnStatus) => {
    setTabStatus((s) => ({ ...s, [tabKey]: status }))
  }, [])

  const runSnippet = (command: string) => {
    const sid = activeTab ? sessionMap.current.get(activeTab) : undefined
    if (!sid) {
      toast.error('Open a session first, then run a snippet')
      return
    }
    sendInput(sid, Array.from(encoder.encode(`${command}\n`))).catch((e) =>
      toast.error(`Could not send snippet: ${errMessage(e)}`),
    )
  }

  const refresh = useCallback(async () => {
    try {
      const [h, g] = await Promise.all([listHosts(), listGroups()])
      setHosts(h)
      setGroups(g)
    } catch (e) {
      toast.error(`Failed to load: ${errMessage(e)}`)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Start forwards flagged auto-start once, when the window opens.
  useEffect(() => {
    listForwards()
      .then((items) => items.filter((i) => i.forward.autoStart && !i.running))
      .then((pending) => Promise.allSettled(pending.map((i) => startForward(i.forward.id))))
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return hosts
    return hosts.filter((h) =>
      [h.label, h.hostname, h.username, ...h.tags].some((s) => s.toLowerCase().includes(q)),
    )
  }, [hosts, search])

  const grouped = useMemo(() => {
    const byGroup = new Map<string | null, Host[]>()
    for (const h of filtered) {
      const key = h.groupId ?? null
      const arr = byGroup.get(key) ?? []
      arr.push(h)
      byGroup.set(key, arr)
    }
    return byGroup
  }, [filtered])

  const selected = hosts.find((h) => h.id === selectedId) ?? null

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (host: Host) => {
    setEditing(host)
    setDialogOpen(true)
  }

  const onDelete = async (host: Host) => {
    const ok = await confirm(`Delete "${host.label}"? This cannot be undone.`, {
      title: 'Delete host',
      kind: 'warning',
    })
    if (!ok) return
    try {
      await deleteHost(host.id)
      if (selectedId === host.id) setSelectedId(null)
      toast.success('Host deleted')
      refresh()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }

  const submitNewGroup = async () => {
    const name = newGroupName.trim()
    if (!name) {
      setNewGroupOpen(false)
      return
    }
    try {
      await createGroup(name)
      setNewGroupName('')
      setNewGroupOpen(false)
      refresh()
    } catch (e) {
      toast.error(`Could not create group: ${errMessage(e)}`)
    }
  }

  const onDeleteGroup = async (group: Group) => {
    const ok = await confirm(`Delete group "${group.name}"? Hosts inside become ungrouped.`, {
      title: 'Delete group',
      kind: 'warning',
    })
    if (!ok) return
    try {
      await deleteGroup(group.id)
      refresh()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }

  const connect = (host: Host) => {
    const key = crypto.randomUUID()
    setTabs((t) => [...t, { kind: 'terminal', key, hostId: host.id, label: host.label }])
    setActiveTab(key)
    setHeaderCollapsed(true)
  }

  const openFiles = (host: Host) => {
    const key = crypto.randomUUID()
    setTabs((t) => [...t, { kind: 'files', key, hostId: host.id, label: host.label }])
    setActiveTab(key)
    setHeaderCollapsed(true)
  }

  const openPreview = (file: {
    origin: 'local' | 'remote'
    path: string
    name: string
    sftpId?: string
  }) => {
    const key = crypto.randomUUID()
    setTabs((t) => [
      ...t,
      { kind: 'preview', key, label: file.name, origin: file.origin, path: file.path, sftpId: file.sftpId },
    ])
    setActiveTab(key)
  }

  const removeTab = (key: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key)
      setActiveTab((cur) => (cur === key ? (next.at(-1)?.key ?? null) : cur))
      return next
    })
    setTabStatus((s) => {
      const next = { ...s }
      delete next[key]
      return next
    })
  }

  const closeTab = async (key: string) => {
    const tab = tabs.find((t) => t.key === key)
    if (tab && (tab.kind === 'terminal' || tab.kind === 'files')) {
      const ok = await confirm(
        `Close this ${tab.kind === 'terminal' ? 'terminal' : 'file'} tab? Its connection will be closed.`,
        { title: 'Close tab', kind: 'warning' },
      )
      if (!ok) return
    }
    removeTab(key)
  }

  const hostConnected = (hostId: string) =>
    tabs.some((t) => t.kind === 'terminal' && t.hostId === hostId)

  const disconnectHost = (host: Host) => {
    const tab = tabs.filter((t) => t.kind === 'terminal' && t.hostId === host.id).at(-1)
    if (tab) removeTab(tab.key)
  }

  const renameTab = (key: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.key === key ? { ...t, label } : t)))
  }

  const connectedHostIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tabs) {
      if (t.kind === 'terminal' && tabStatus[t.key] === 'connected') ids.add(t.hostId)
    }
    return ids
  }, [tabs, tabStatus])

  return (
    <div className="myssh-bg flex h-screen w-screen text-[#edf3f7]">
      {/* Sidebar */}
      <aside className="myssh-panel flex w-80 flex-col border-r">
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-5 text-cyan-300" />
            <span className="text-sm font-semibold tracking-wide">MySSH</span>
          </div>
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" title="Port forwarding" onClick={() => setForwardsOpen(true)}>
              <ArrowRightLeft className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" title="Known hosts" onClick={() => setKnownHostsOpen(true)}>
              <ShieldCheck className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" title="Snippets" onClick={() => setSnippetsOpen(true)}>
              <Code2 className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" title="New group" onClick={() => setNewGroupOpen(true)}>
              <FolderPlus className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" title="New host" onClick={openNew}>
              <Plus className="size-4" />
            </Button>
          </div>
        </header>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#7c8797]" />
            <input
              className="w-full rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-3 text-sm outline-none focus:border-cyan-300/40"
              placeholder="Search hosts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {newGroupOpen && (
          <div className="px-4 pb-2">
            <input
              autoFocus
              className="w-full rounded-md border border-cyan-300/30 bg-white/[0.05] px-3 py-1.5 text-sm outline-none"
              placeholder="Group name, Enter to save"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewGroup()
                if (e.key === 'Escape') {
                  setNewGroupName('')
                  setNewGroupOpen(false)
                }
              }}
              onBlur={submitNewGroup}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => {
            const list = grouped.get(group.id) ?? []
            return (
              <GroupSection
                key={group.id}
                title={group.name}
                hosts={list}
                selectedId={selectedId}
                connectedIds={connectedHostIds}
                onSelect={setSelectedId}
                onConnect={connect}
                onDeleteGroup={() => onDeleteGroup(group)}
              />
            )
          })}
          <GroupSection
            title="Ungrouped"
            hosts={grouped.get(null) ?? []}
            selectedId={selectedId}
            connectedIds={connectedHostIds}
            onSelect={setSelectedId}
            onConnect={connect}
          />
          {hosts.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[#7c8797]">
              No hosts yet. Click <span className="text-cyan-300">+</span> to add one.
            </p>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col">
        {tabs.length > 0 ? (
          <>
            {headerCollapsed ? (
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-1.5">
                <button
                  className="text-[#9aa6b6] hover:text-cyan-300"
                  title="Show host details"
                  onClick={() => setHeaderCollapsed(false)}
                >
                  <ChevronDown className="size-4" />
                </button>
                <span className="text-sm font-medium">{selected ? selected.label : 'No host selected'}</span>
                {selected && (
                  <span className="font-mono text-xs text-[#7c8797]">
                    {selected.username}@{selected.hostname}
                  </span>
                )}
                {selected && (
                  <div className="ml-auto flex gap-1">
                    {hostConnected(selected.id) ? (
                      <Button size="sm" variant="ghost" onClick={() => disconnectHost(selected)}>
                        <Unplug className="size-4" /> Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => connect(selected)}>
                        <TerminalSquare className="size-4" /> Connect
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openFiles(selected)}>
                      <FolderOpen className="size-4" /> Files
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-b border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold">
                      {selected ? selected.label : 'No host selected'}
                    </h1>
                    {selected && (
                      <p className="mt-0.5 truncate font-mono text-xs text-[#9aa6b6]">
                        {selected.username}@{selected.hostname}:{selected.port}
                        {selected.tags.length > 0 && <span className="ml-2">· {selected.tags.join(', ')}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {selected && (
                      <>
                        {hostConnected(selected.id) ? (
                          <Button variant="ghost" size="sm" onClick={() => disconnectHost(selected)}>
                            <Unplug className="size-4" /> Disconnect
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => connect(selected)}>
                            <TerminalSquare className="size-4" /> Connect
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openFiles(selected)}>
                          <FolderOpen className="size-4" /> Files
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(selected)}>
                          <Pencil className="size-4" /> Edit
                        </Button>
                      </>
                    )}
                    <Button size="icon-sm" variant="ghost" title="Collapse" onClick={() => setHeaderCollapsed(true)}>
                      <ChevronUp className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <Workspace
                tabs={tabs}
                activeKey={activeTab}
                onActivate={setActiveTab}
                onClose={closeTab}
                onRename={renameTab}
                onSessionForTab={registerSession}
                onStatusForTab={registerStatus}
                tabStatus={tabStatus}
                onPreview={openPreview}
              />
            </div>
          </>
        ) : selected ? (
          <div className="flex h-full flex-col p-8">
            <div className="myssh-panel rounded-xl border p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-semibold">{selected.label}</h1>
                  <p className="mt-1 font-mono text-sm text-[#9aa6b6]">
                    {selected.username}@{selected.hostname}:{selected.port}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openFiles(selected)}>
                    <FolderOpen className="size-4" /> Files
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(selected)}>
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row label="Auth method" value={selected.authMethod} />
                <Row label="Stored secret" value={selected.hasSecret ? 'Yes' : 'No'} />
                {selected.authMethod === 'key' && (
                  <Row label="Key file" value={selected.keyPath ?? '—'} />
                )}
                <Row label="Tags" value={selected.tags.length ? selected.tags.join(', ') : '—'} />
              </dl>

              <div className="mt-6">
                <Button onClick={() => connect(selected)}>
                  <TerminalSquare className="size-4" /> Connect
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-[#7c8797]">
            <Server className="mb-4 size-12 opacity-40" />
            <p className="text-sm">Select a host to see its details, or create a new one.</p>
          </div>
        )}
      </main>

      <HostDialog
        open={dialogOpen}
        host={editing}
        groups={groups}
        hosts={hosts}
        onClose={() => setDialogOpen(false)}
        onSaved={refresh}
      />

      <SnippetsPanel
        open={snippetsOpen}
        onClose={() => setSnippetsOpen(false)}
        onRun={runSnippet}
      />

      <ForwardsPanel open={forwardsOpen} onClose={() => setForwardsOpen(false)} hosts={hosts} />

      <KnownHostsPanel open={knownHostsOpen} onClose={() => setKnownHostsOpen(false)} />

      <HostKeyModal />
    </div>
  )
}

function GroupSection({
  title,
  hosts,
  selectedId,
  connectedIds,
  onSelect,
  onConnect,
  onDeleteGroup,
}: {
  title: string
  hosts: Host[]
  selectedId: string | null
  connectedIds: Set<string>
  onSelect: (id: string) => void
  onConnect: (host: Host) => void
  onDeleteGroup?: () => void
}) {
  if (hosts.length === 0 && !onDeleteGroup) return null
  return (
    <div className="mb-2">
      <div className="group flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7c8797]">
          {title}
        </span>
        {onDeleteGroup && (
          <button
            className="opacity-0 transition group-hover:opacity-100"
            title="Delete group"
            onClick={onDeleteGroup}
          >
            <Trash2 className="size-3.5 text-[#7c8797] hover:text-[#ffb4ab]" />
          </button>
        )}
      </div>
      {hosts.map((host) => {
        const connected = connectedIds.has(host.id)
        return (
          <button
            key={host.id}
            onClick={() => onSelect(host.id)}
            onDoubleClick={() => onConnect(host)}
            title="Double-click to connect"
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition ${
              selectedId === host.id ? 'bg-cyan-300/12 text-cyan-100' : 'hover:bg-white/[0.04]'
            }`}
          >
            <span className="relative shrink-0">
              <Server className={`size-4 ${connected ? 'text-emerald-300' : 'text-[#7c8797]'}`} />
              {connected && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[#0d0f14]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{host.label}</span>
              <span className="block truncate font-mono text-xs text-[#7c8797]">
                {host.username}@{host.hostname}
              </span>
            </span>
            {host.lastUsed != null && (
              <span className="shrink-0 text-[10px] text-[#5f6b7a]">{formatRelative(host.lastUsed)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#7c8797]">{label}</dt>
      <dd className="truncate font-mono">{value}</dd>
    </>
  )
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

function formatRelative(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
