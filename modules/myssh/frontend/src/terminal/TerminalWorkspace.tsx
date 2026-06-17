import { useState } from 'react'
import { X } from 'lucide-react'
import { TerminalView } from './TerminalView'

export interface SessionTab {
  key: string
  hostId: string
  label: string
}

interface Props {
  tabs: SessionTab[]
  activeKey: string | null
  onActivate: (key: string) => void
  onClose: (key: string) => void
  onRename: (key: string, label: string) => void
  onSessionForTab?: (tabKey: string, sessionId: string | null) => void
}

export function TerminalWorkspace({
  tabs,
  activeKey,
  onActivate,
  onClose,
  onRename,
  onSessionForTab,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (tab: SessionTab) => {
    setEditingKey(tab.key)
    setDraft(tab.label)
  }
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
              activeKey === tab.key
                ? 'bg-cyan-300/15 text-cyan-100'
                : 'text-[#9aa6b6] hover:bg-white/5'
            }`}
          >
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
                  startEdit(tab)
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

      {/* All terminals stay mounted; only the active one is visible so background
          sessions keep streaming. visibility:hidden (not display:none) preserves
          layout size so xterm's fit addon can still measure. */}
      <div className="relative flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className="absolute inset-0 p-2"
            style={{ visibility: activeKey === tab.key ? 'visible' : 'hidden' }}
          >
            <TerminalView
              hostId={tab.hostId}
              active={activeKey === tab.key}
              onSession={(sid) => onSessionForTab?.(tab.key, sid)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
