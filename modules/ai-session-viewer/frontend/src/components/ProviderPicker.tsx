import { Button, Input } from '@desk-launcher/ui'
import { FolderSearch } from 'lucide-react'
import type { ProviderInfo } from '../types'

interface Props {
  providers: ProviderInfo[]
  providerId: string | null
  basePath: string
  loading: boolean
  onSelectProvider: (id: string) => void
  onBasePathChange: (value: string) => void
  onLoad: () => void
}

export function ProviderPicker({
  providers,
  providerId,
  basePath,
  loading,
  onSelectProvider,
  onBasePathChange,
  onLoad,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {providers.map((p) => {
          const active = p.id === providerId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProvider(p.id)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors border',
                active
                  ? 'bg-[var(--brand)]/15 text-[var(--text)] border-[var(--brand)]/40'
                  : 'text-[var(--text-muted)] border-[var(--line)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]',
              ].join(' ')}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Sessions folder
        </label>
        <div className="flex gap-2">
          <Input
            value={basePath}
            spellCheck={false}
            placeholder="Path to the sessions root folder"
            onChange={(e) => onBasePathChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLoad()
            }}
            className="h-9 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={onLoad}
            disabled={loading}
            className="shrink-0 gap-1.5"
          >
            <FolderSearch className="h-4 w-4" />
            {loading ? 'Loading…' : 'Load'}
          </Button>
        </div>
      </div>
    </div>
  )
}
