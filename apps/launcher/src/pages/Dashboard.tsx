import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button, Input } from '@desk-launcher/ui'
import {
  AlertCircle,
  CirclePlus,
  Gauge,
  LayoutDashboard,
  ListTree,
  RadioTower,
  RefreshCw,
  Search,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import { MODULES } from '../modules/registry'
import { ModuleCard } from '../components/ModuleCard'

const sidebarItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Process Kill', icon: Gauge },
  { label: 'Network', icon: RadioTower },
  { label: 'System Logs', icon: ListTree },
]

export function Dashboard() {
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<string[]>([])
  const [query, setQuery] = useState('')

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
      return (
        needle.length === 0 ||
        module.displayName.toLowerCase().includes(needle) ||
        module.description.toLowerCase().includes(needle) ||
        module.shortName.toLowerCase().includes(needle)
      )
    })
  }, [query])

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
    <div className="launcher-bg flex h-screen overflow-hidden text-[#edf3f7]">
      <aside className="launcher-panel m-3 hidden h-[calc(100%-24px)] w-64 flex-shrink-0 flex-col rounded-xl border py-3 text-white md:flex">
        <div className="mb-8 px-4">
          <h1 className="launcher-lux-text text-2xl font-semibold leading-8 tracking-tight">Desk Launcher</h1>
          <p className="mt-1 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider text-[#aeb8c7]">
            v1.0.4-stable
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                className={
                  item.active
                    ? 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.075] px-4 py-3 text-left text-sm text-[#edf3f7] shadow-inner shadow-white/[0.02]'
                    : 'flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-[#aeb8c7] transition-all duration-150 hover:bg-white/[0.055] hover:text-[#edf3f7]'
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                <span> {item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto px-4">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-lg border-white/10 bg-white/[0.035] text-xs text-[#edf3f7] hover:bg-white/[0.07] hover:text-white"
          >
            <CirclePlus className="size-[18px]" aria-hidden="true" />
            <span>New module scaffold</span>
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="launcher-panel m-3 ml-0 flex h-16 flex-shrink-0 items-center justify-between gap-4 rounded-xl border px-4">
          <div className="relative w-full max-w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#aeb8c7]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 rounded-lg border-white/10 bg-white/[0.045] pl-10 text-xs text-[#edf3f7] placeholder:text-[#aeb8c7] shadow-none focus-visible:border-[#b79cff]/50 focus-visible:ring-[#b79cff]/25"
              placeholder="Search modules..."
              type="text"
            />
          </div>

          <div className="flex items-center gap-2 text-[#aeb8c7]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={refreshOpenModules}
              className="rounded-full text-[#aeb8c7] hover:bg-white/[0.07] hover:text-white"
              title="Refresh status"
            >
              <RefreshCw className="size-5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-[#aeb8c7] hover:bg-white/[0.07] hover:text-white"
              title="Settings"
            >
              <Settings className="size-5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-[#aeb8c7] hover:bg-white/[0.07] hover:text-white"
              title="Terminal"
            >
              <TerminalSquare className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {error && (
            <div className="mx-auto mb-4 flex max-w-[1600px] items-start gap-3 rounded-lg border border-red-300/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                opening={opening === module.id}
                isOpen={openModules.includes(module.id)}
                onOpen={() => handleOpen(module.id)}
              />
            ))}
          </div>
        </div>

        <footer className="launcher-panel m-3 ml-0 mt-0 flex h-8 flex-shrink-0 items-center justify-between rounded-xl border px-4 text-[#aeb8c7]">
          <div className="flex gap-4 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider">
            <span>System Health: Optimal | CPU: 12% | RAM: 4.2GB</span>
            <span className="text-white/25">|</span>
            <span>{MODULES.length} modules available | v1.0.4-stable</span>
          </div>
          <div className="hidden gap-4 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider sm:flex">
            <a className="transition-colors duration-200 hover:text-white" href="#">
              Documentation
            </a>
            <a className="transition-colors duration-200 hover:text-white" href="#">
              API Status
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}
