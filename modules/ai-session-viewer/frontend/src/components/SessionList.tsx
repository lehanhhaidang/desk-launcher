import { MessageSquare } from 'lucide-react'
import { LoadingSpinner } from '@desk-launcher/ui'
import type { SessionEntry } from '../types'
import { formatUnix } from '../format'

interface Props {
  sessions: SessionEntry[]
  activePath: string | null
  loading: boolean
  onSelect: (session: SessionEntry) => void
}

export function SessionList({ sessions, activePath, loading, onSelect }: Props) {
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
        const label = session.title?.trim() || session.id
        return (
          <li key={session.path}>
            <button
              type="button"
              onClick={() => onSelect(session)}
              title={label}
              className={[
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                active
                  ? 'bg-[var(--brand)]/15 text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
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
          </li>
        )
      })}
    </ul>
  )
}
