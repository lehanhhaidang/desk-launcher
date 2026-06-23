import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Button, Input } from '@desk-launcher/ui'
import { FolderOpen, FolderSearch } from 'lucide-react'
import type { ProviderInfo } from '../types'

interface Props {
  providers: ProviderInfo[]
  providerId: string | null
  basePath: string
  loading: boolean
  onSelectProvider: (id: string) => void
  onBasePathChange: (value: string) => void
  onLoad: (override?: string) => void
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
  async function browse() {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select sessions folder',
      defaultPath: basePath || undefined,
    })
    if (typeof picked === 'string') onLoad(picked)
  }

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
            variant="outline"
            onClick={browse}
            disabled={loading}
            title="Browse for folder"
            className="shrink-0 gap-1.5"
          >
            <FolderOpen className="h-4 w-4" />
            Browse
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onLoad()}
          disabled={loading}
          className="w-full gap-1.5"
        >
          <FolderSearch className="h-4 w-4" />
          {loading ? 'Loading…' : 'Load projects'}
        </Button>
      </div>
    </div>
  )
}
