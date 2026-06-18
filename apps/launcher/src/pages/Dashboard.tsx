import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button, Input } from '@desk-launcher/ui'
import {
  AlertCircle,
  BrainCircuit,
  CirclePlus,
  Database,
  FileCode2,
  Gauge,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListTree,
  Palette,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { ThemePicker } from '@desk-launcher/theme'
import { MODULES } from '../modules/registry'
import { ModuleCard } from '../components/ModuleCard'

const sidebarItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Process Kill', icon: Gauge },
  { label: 'Network', icon: RadioTower },
  { label: 'System Logs', icon: ListTree },
]

type Modal = 'settings' | 'scaffold' | null

export function Dashboard() {
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<Modal>(null)

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
    <div className="launcher-bg flex h-screen overflow-hidden text-[var(--text)]">
      <aside className="launcher-panel m-3 hidden h-[calc(100%-24px)] w-64 flex-shrink-0 flex-col rounded-xl border py-3 text-[var(--text)] md:flex">
        <div className="mb-8 px-4">
          <h1 className="launcher-lux-text text-2xl font-semibold leading-8 tracking-tight">Desk Launcher</h1>
          <p className="mt-1 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider text-[var(--text-muted)]">
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
                    ? 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.075] px-4 py-3 text-left text-sm text-[var(--text)] shadow-inner shadow-white/[0.02]'
                    : 'flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-[var(--text-muted)] transition-all duration-150 hover:bg-white/[0.055] hover:text-[var(--text)]'
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
            onClick={() => setModal('scaffold')}
            className="h-9 w-full rounded-lg border-white/10 bg-white/[0.035] text-xs text-[var(--text)] hover:bg-white/[0.07] hover:text-[var(--text)]"
          >
            <CirclePlus className="size-[18px]" aria-hidden="true" />
            <span>New module scaffold</span>
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="launcher-panel m-3 ml-0 flex h-16 flex-shrink-0 items-center justify-between gap-4 rounded-xl border px-4">
          <div className="relative w-full max-w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 rounded-lg border-white/10 bg-white/[0.045] pl-10 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] shadow-none focus-visible:border-[var(--brand-2)]/50 focus-visible:ring-[var(--brand-2)]/25"
              placeholder="Search modules..."
              type="text"
            />
          </div>

          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={refreshOpenModules}
              className="rounded-full text-[var(--text-muted)] hover:bg-white/[0.07] hover:text-[var(--text)]"
              title="Refresh status"
            >
              <RefreshCw className="size-5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setModal('settings')}
              className="rounded-full text-[var(--text-muted)] hover:bg-white/[0.07] hover:text-[var(--text)]"
              title="Settings"
            >
              <Settings className="size-5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-[var(--text-muted)] hover:bg-white/[0.07] hover:text-[var(--text)]"
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

        <footer className="launcher-panel m-3 ml-0 mt-0 flex h-8 flex-shrink-0 items-center justify-between rounded-xl border px-4 text-[var(--text-muted)]">
          <div className="flex gap-4 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider">
            <span>System Health: Optimal | CPU: 12% | RAM: 4.2GB</span>
            <span className="text-white/25">|</span>
            <span>{MODULES.length} modules available | v1.0.4-stable</span>
          </div>
          <div className="hidden gap-4 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider sm:flex">
            <a className="transition-colors duration-200 hover:text-[var(--text)]" href="#">
              Documentation
            </a>
            <a className="transition-colors duration-200 hover:text-[var(--text)]" href="#">
              API Status
            </a>
          </div>
        </footer>
      </main>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'scaffold' && <ScaffoldModal onClose={() => setModal(null)} />}
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      title="Settings"
      eyebrow="Launcher AI"
      icon={<KeyRound className="size-5" />}
      onClose={onClose}
      description="Appearance and AI credentials for Desk Launcher."
    >
      <section className="launcher-panel mb-4 rounded-xl border p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
            <Palette className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)]">Appearance</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Theme, accent, background and typography. Saved on this device.
            </p>
          </div>
        </div>
        <ThemePicker />
      </section>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="launcher-panel rounded-xl border p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text)]">Credential scope</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                This key is for launcher-only actions: module scaffolding, summary generation, and planning documents.
                It is not shared with module windows such as Virtual Comtor.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-[var(--text-muted)]">
            <InfoRow label="Storage target" value="Launcher secure settings" />
            <InfoRow label="Current status" value="Not connected" />
            <InfoRow label="Provider strategy" value="Multi-provider ready" />
          </div>
        </section>

        <section className="launcher-panel rounded-xl border p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[var(--text)]">AI provider</h3>
              <p className="text-sm text-[var(--text-muted)]">OpenAI is the first provider; the shape leaves room for others.</p>
            </div>
            <span className="rounded-md border border-emerald-200/25 bg-emerald-200/10 px-2 py-1 font-mono text-[11px] font-bold uppercase text-emerald-100">
              launcher only
            </span>
          </div>

        <div className="grid gap-3 md:grid-cols-2">
            <Field label="Provider" hint="Example: OpenAI">
              <select className="launcher-input">
                <option>OpenAI</option>
                <option disabled>Anthropic (later)</option>
                <option disabled>Google Gemini (later)</option>
                <option disabled>Local OpenAI-compatible endpoint (later)</option>
              </select>
            </Field>
            <Field label="Model" hint="Example: gpt-4.1-mini">
              <Input className="launcher-input" defaultValue="gpt-4.1-mini" />
            </Field>
            <Field label="API key" hint="Stored for launcher workflows only">
              <Input className="launcher-input font-mono" type="password" placeholder="sk-..." />
            </Field>
            <Field label="Base URL" hint="Optional for compatible providers">
              <Input className="launcher-input" placeholder="https://api.openai.com/v1" />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--text)] hover:bg-white/[0.07]">
              Test connection
            </Button>
            <Button className="launcher-primary-button">
              Save settings
            </Button>
          </div>
        </section>
      </div>
    </ModalShell>
  )
}

function ScaffoldModal({ onClose }: { onClose: () => void }) {
  const [pages, setPages] = useState([
    {
      name: '',
      description: '',
      features: [
        { name: '', description: '' },
      ],
    },
  ])

  const addPage = () => setPages((prev) => [...prev, { name: '', description: '', features: [] }])

  return (
    <ModalShell
      title="New module scaffold"
      eyebrow="Module generator"
      icon={<WandSparkles className="size-5" />}
      onClose={onClose}
      description="Describe the module once, generate a code scaffold plus planning Markdown for AI-assisted development."
      wide
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-4">
          <section className="launcher-form-section rounded-xl border p-4">
            <SectionTitle icon={<Layers3 className="size-4" />} title="Module identity" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Module ID" hint="Example: report-builder">
                <Input className="launcher-input font-mono" placeholder="report-builder" />
              </Field>
              <Field label="Display name" hint="Example: Report Builder">
                <Input className="launcher-input" placeholder="Report Builder" />
              </Field>
              <Field label="Short name" hint="Example: Reports">
                <Input className="launcher-input" placeholder="Reports" />
              </Field>
              <Field label="Category" hint="Used by launcher registry">
                <select className="launcher-input">
                  <option>productivity</option>
                  <option>media</option>
                  <option>dev</option>
                  <option>utility</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="launcher-form-section rounded-xl border p-4">
            <SectionTitle icon={<BrainCircuit className="size-4" />} title="Idea and behavior" />
            <div className="mt-4 grid gap-3">
              <Field label="Idea summary" hint="What problem does this module solve?">
                <textarea
                  className="launcher-textarea min-h-28"
                  placeholder="Example: A desktop tool that imports meeting notes, extracts action items, and exports a client-ready summary."
                />
              </Field>
              <Field label="Desired UI style" hint="Visual direction for the module">
                <textarea
                  className="launcher-textarea min-h-24"
                  placeholder="Example: Open Sesame-like glass UI, calm dark surface, two-column workflow, compact toolbar."
                />
              </Field>
            </div>
          </section>

          <section className="launcher-form-section rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={<FileCode2 className="size-4" />} title="Pages & features" />
              <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--text)]" onClick={addPage}>
                <Plus className="size-4" />
                Add page
              </Button>
            </div>
            <PageFeatureEditor pages={pages} onChange={setPages} />
          </section>
        </div>

        <aside className="launcher-form-section flex min-h-0 flex-col rounded-xl border p-4 xl:sticky xl:top-0 xl:max-h-[calc(92vh-9.5rem)]">
          <SectionTitle icon={<Database className="size-4" />} title="Generated planning pack" />
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            After confirmation, the launcher will create a module template and ask AI to summarize your description into
            focused Markdown docs. These docs are meant to be handed back to an AI coding agent.
          </p>

          <div className="mt-4 space-y-2">
            {[
              ['README.md', 'Human-facing module overview and setup notes.'],
              ['docs/architecture.md', 'How the module wires into Tauri, React, permissions, and launcher registry.'],
              ['docs/product-plan.md', 'User idea summary, feature scope, page list, and acceptance notes.'],
              ['docs/data-storage.md', 'Where local data lives, database shape, and migration expectations.'],
              ['docs/ui-direction.md', 'Visual style, target screens, component states, and UX constraints.'],
              ['docs/ai-brief.md', 'A concise prompt-ready brief for the next AI development pass.'],
            ].map(([name, description]) => (
              <div key={name} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="font-mono text-xs font-bold text-[var(--text)]">{name}</div>
                <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="border-white/10 bg-white/[0.035] text-[var(--text)]" onClick={onClose}>
                Cancel
              </Button>
              <Button className="launcher-primary-button">
                Generate scaffold
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  title,
  eyebrow,
  description,
  icon,
  children,
  onClose,
  wide = false,
}: {
  title: string
  eyebrow: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="launcher-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className={`launcher-modal flex max-h-[92vh] w-full flex-col rounded-2xl border ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-cyan-100">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{eyebrow}</div>
              <h2 className="mt-1 text-xl font-semibold text-[var(--text)]">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full text-[var(--text-muted)] hover:bg-white/[0.07] hover:text-[var(--text)]" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-3">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{hint}</span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-[var(--text)]">
      <span className="text-cyan-100">{icon}</span>
      <span>{title}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-xs text-[var(--text)]">{value}</span>
    </div>
  )
}

type ScaffoldFeature = { name: string; description: string }
type ScaffoldPage = { name: string; description: string; features: ScaffoldFeature[] }

function PageFeatureEditor({
  pages,
  onChange,
}: {
  pages: ScaffoldPage[]
  onChange: (pages: ScaffoldPage[]) => void
}) {
  const updatePage = (pageIndex: number, key: 'name' | 'description', value: string) => {
    onChange(pages.map((page, idx) => (idx === pageIndex ? { ...page, [key]: value } : page)))
  }

  const removePage = (pageIndex: number) => {
    onChange(pages.filter((_, idx) => idx !== pageIndex))
  }

  const addFeature = (pageIndex: number) => {
    onChange(
      pages.map((page, idx) =>
        idx === pageIndex
          ? { ...page, features: [...page.features, { name: '', description: '' }] }
          : page,
      ),
    )
  }

  const updateFeature = (
    pageIndex: number,
    featureIndex: number,
    key: 'name' | 'description',
    value: string,
  ) => {
    onChange(
      pages.map((page, idx) =>
        idx === pageIndex
          ? {
              ...page,
              features: page.features.map((feature, fIdx) =>
                fIdx === featureIndex ? { ...feature, [key]: value } : feature,
              ),
            }
          : page,
      ),
    )
  }

  const removeFeature = (pageIndex: number, featureIndex: number) => {
    onChange(
      pages.map((page, idx) =>
        idx === pageIndex
          ? { ...page, features: page.features.filter((_, fIdx) => fIdx !== featureIndex) }
          : page,
      ),
    )
  }

  return (
    <div className="mt-4 space-y-3">
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_36px]">
            <Input
              className="launcher-input"
              value={page.name}
              placeholder="Example: Dashboard, Converter, Settings"
              onChange={(event) => updatePage(pageIndex, 'name', event.target.value)}
            />
            <Input
              className="launcher-input"
              value={page.description}
              placeholder="Describe what this page shows and what the user can do here."
              onChange={(event) => updatePage(pageIndex, 'description', event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-[var(--text-muted)] hover:bg-red-400/10 hover:text-red-200"
              onClick={() => removePage(pageIndex)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Sparkles className="size-4 text-cyan-100" />
                <span>Features on this page</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-white/10 bg-white/[0.035] text-[var(--text)]"
                onClick={() => addFeature(pageIndex)}
              >
                <Plus className="size-4" />
                Add feature
              </Button>
            </div>

            <div className="space-y-2">
              {page.features.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-[var(--text-muted)]">
                  No features yet. Add feature ideas for this page.
                </div>
              )}
              {page.features.map((feature, featureIndex) => (
                <div key={featureIndex} className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_36px]">
                  <Input
                    className="launcher-input"
                    value={feature.name}
                    placeholder="Example: Import files, Live preview, Export result"
                    onChange={(event) => updateFeature(pageIndex, featureIndex, 'name', event.target.value)}
                  />
                  <Input
                    className="launcher-input"
                    value={feature.description}
                    placeholder="Describe behavior, state, edge cases, and expected outputs for this feature."
                    onChange={(event) => updateFeature(pageIndex, featureIndex, 'description', event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-[var(--text-muted)] hover:bg-red-400/10 hover:text-red-200"
                    onClick={() => removeFeature(pageIndex, featureIndex)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
