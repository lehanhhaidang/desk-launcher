import { useState } from 'react'
import { X } from 'lucide-react'
import { TerminalView, type ConnStatus } from '../terminal/TerminalView'
import { FilesTab } from './FilesTab'
import { PreviewTab } from './PreviewTab'

export type WorkspaceTab =
  | { kind: 'terminal'; key: string; hostId: string; label: string }
  | { kind: 'files'; key: string; hostId: string; label: string }
  | {
      kind: 'preview'
      key: string
      label: string
      origin: 'local' | 'remote'
      path: string
      sftpId?: string
    }

interface Props {
  tabs: WorkspaceTab[]
  activeKey: string | null
  onActivate: (key: string) => void
  onClose: (key: string) => void
  onRename: (key: string, label: string) => void
  onSessionForTab?: (tabKey: string, sessionId: string | null) => void
  onStatusForTab?: (tabKey: string, status: ConnStatus) => void
  tabStatus?: Record<string, ConnStatus>
  onPreview?: (file: {
    origin: 'local' | 'remote'
    path: string
    name: string
    sftpId?: string
  }) => void
}

export function Workspace({
  tabs,
  activeKey,
  onActivate,
  onClose,
  onRename,
  onSessionForTab,
  onStatusForTab,
  tabStatus,
  onPreview,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const commitEdit = () => {
    if (editingKey) {
      const name = draft.trim()
      if (name) onRename(editingKey, name)
    }
    setEditingKey(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-black/20 px-2 py-1.5">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            onClick={() => onActivate(tab.key)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
              activeKey === tab.key ? 'bg-[color-mix(in_oklch,var(--brand)_15%,transparent)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-white/5'
            }`}
          >
            {tab.kind === 'terminal' && (
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  tabStatus?.[tab.key] === 'connected'
                    ? 'bg-emerald-400'
                    : tabStatus?.[tab.key] === 'connecting'
                      ? 'animate-pulse bg-amber-400'
                      : 'bg-white/30'
                }`}
                title={tabStatus?.[tab.key] ?? 'connecting'}
              />
            )}
            <span
              className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                tab.kind === 'terminal'
                  ? 'bg-emerald-300/15 text-emerald-200'
                  : tab.kind === 'files'
                    ? 'bg-[color-mix(in_oklch,var(--brand)_15%,transparent)] text-[var(--brand)]'
                    : 'bg-[color-mix(in_oklch,var(--brand-2)_15%,transparent)] text-[var(--brand-2)]'
              }`}
            >
              {tab.kind === 'terminal' ? 'SSH' : tab.kind === 'files' ? 'SFTP' : 'FILE'}
            </span>
            {editingKey === tab.key ? (
              <input
                autoFocus
                className="w-28 bg-transparent text-sm outline-none"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingKey(null)
                }}
              />
            ) : (
              <span
                className="max-w-[160px] truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setEditingKey(tab.key)
                  setDraft(tab.label)
                }}
                title="Double-click to rename"
              >
                {tab.label}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.key)
              }}
              className="opacity-50 transition hover:opacity-100"
              title="Close tab"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* All tabs stay mounted (visibility-toggled) so terminals keep streaming
          and SFTP sessions stay open in the background. */}
      <div className="relative flex-1">
        {tabs.map((tab) => {
          const visible = activeKey === tab.key
          return (
            <div
              key={tab.key}
              className="absolute inset-0"
              style={{ visibility: visible ? 'visible' : 'hidden' }}
            >
              {tab.kind === 'terminal' ? (
                <div className="h-full p-2">
                  <TerminalView
                    hostId={tab.hostId}
                    active={visible}
                    onSession={(sid) => onSessionForTab?.(tab.key, sid)}
                    onStatus={(s) => onStatusForTab?.(tab.key, s)}
                  />
                </div>
              ) : tab.kind === 'files' ? (
                <FilesTab
                  hostId={tab.hostId}
                  hostLabel={tab.label}
                  active={visible}
                  onPreview={onPreview}
                />
              ) : (
                <PreviewTab
                  origin={tab.origin}
                  path={tab.path}
                  name={tab.label}
                  sftpId={tab.sftpId}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
