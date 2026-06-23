import { Folder } from 'lucide-react'
import { LoadingSpinner } from '@desk-launcher/ui'
import type { ProjectEntry } from '../types'

interface Props {
  projects: ProjectEntry[]
  activePath: string | null
  loading: boolean
  onSelect: (project: ProjectEntry) => void
}

export function ProjectList({ projects, activePath, loading, onSelect }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-[var(--text-muted)]">
        <LoadingSpinner size="sm" /> Scanning projects…
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <p className="px-1 py-4 text-xs text-[var(--text-muted)]">
        No projects loaded yet. Pick a provider and load its folder.
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {projects.map((project) => {
        const active = project.path === activePath
        return (
          <li key={project.path}>
            <button
              type="button"
              onClick={() => onSelect(project)}
              title={project.path}
              className={[
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                active
                  ? 'bg-[var(--brand)]/15 text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <Folder className="h-4 w-4 shrink-0 opacity-70" />
              <span className="flex-1 truncate">{project.name}</span>
              <span className="shrink-0 tabular-nums opacity-60">{project.sessionCount}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
