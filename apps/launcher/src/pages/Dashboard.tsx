import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button, Input } from '@desk-launcher/ui'
import { AlertCircle, Grid2X2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { MODULES, type ModuleCategory } from '../modules/registry'
import { ModuleCard } from '../components/ModuleCard'

type Filter = ModuleCategory | 'all'

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'media', label: 'Media' },
  { value: 'dev', label: 'Dev' },
  { value: 'utility', label: 'Utility' },
]

export function Dashboard() {
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const refreshOpenModules = async () => {
    try {
      const modules = await invoke<string[]>('list_open_modules')
      setOpenModules(modules)
    } catch (err) {
      console.error('Failed to list open modules', err)
    }
  }

  useEffect(() => {
    void refreshOpenModules()
  }, [])

  const visibleModules = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return MODULES.filter((module) => {
      const matchesFilter = filter === 'all' || module.category === filter
      const matchesQuery =
        needle.length === 0 ||
        module.displayName.toLowerCase().includes(needle) ||
        module.description.toLowerCase().includes(needle) ||
        module.shortName.toLowerCase().includes(needle)

      return matchesFilter && matchesQuery
    })
  }, [filter, query])

  const handleOpen = async (id: string) => {
    setOpening(id)
    setError(null)
    try {
      await invoke('open_module', { id })
      await refreshOpenModules()
    } catch (err) {
      console.error('Failed to open module', id, err)
      setError(`Unable to open "${id}": ${String(err)}`)
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <header className="border-b border-border/70 bg-background/80 px-6 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Grid2X2 className="size-4" aria-hidden="true" />
                Desk Launcher
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Launch center</h1>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-md border border-border/70 bg-card/80 px-3 py-2 text-sm text-muted-foreground shadow-sm shadow-black/20">
                <span className="font-medium text-foreground">{openModules.length}</span> running
              </div>
              <Button type="button" variant="outline" size="icon" onClick={refreshOpenModules} title="Refresh status">
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps"
                className="h-10 pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={filter === item.value ? 'default' : 'outline'}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric label="Registered" value={MODULES.length} />
          <Metric label="Available" value={MODULES.filter((module) => module.health === 'ready').length} />
          <Metric label="Visible" value={visibleModules.length} />
        </section>

        {visibleModules.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="rounded-xl border border-border/70 bg-card/35 p-4 shadow-2xl shadow-black/25 ring-1 ring-white/5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map((m) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  opening={opening === m.id}
                  isOpen={openModules.includes(m.id)}
                  onOpen={() => handleOpen(m.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/80 px-4 py-3 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-md bg-muted">
        <Search className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="text-lg font-medium">No matching apps found</div>
      <div className="mt-1 text-sm text-muted-foreground">Try changing the filter or search query.</div>
    </div>
  )
}
