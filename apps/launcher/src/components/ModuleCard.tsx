import type { ModuleDescriptor } from '../modules/registry'
import { Badge, Button } from '@desk-launcher/ui'
import { ArrowUpRight, BookOpen, Download, Languages, Plug, type LucideIcon } from 'lucide-react'

interface Props {
  module: ModuleDescriptor
  opening: boolean
  isOpen: boolean
  onOpen: () => void
}

const categoryLabel: Record<ModuleDescriptor['category'], string> = {
  productivity: 'Productivity',
  media: 'Media',
  dev: 'Dev',
  utility: 'Utility',
}

const iconMap: Record<ModuleDescriptor['icon'], LucideIcon> = {
  plug: Plug,
  'book-open': BookOpen,
  languages: Languages,
  download: Download,
}

export function ModuleCard({ module, opening, isOpen, onOpen }: Props) {
  const Icon = iconMap[module.icon]

  return (
    <article className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-white/10 bg-card/95 text-card-foreground shadow-[0_16px_45px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/5 transition duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-card hover:shadow-[0_24px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className={`m-3 flex items-start justify-between rounded-lg border bg-gradient-to-br p-3 shadow-inner shadow-black/20 ${module.accentClass}`}>
        <div className="flex size-11 items-center justify-center rounded-md border border-current/20 bg-background/10">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          {isOpen && <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.7)]" />}
          <Badge variant="secondary" className="rounded-md bg-background/20 text-current">
            {categoryLabel[module.category]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">{module.shortName}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{module.displayName}</h2>
          </div>
          <Badge variant={isOpen ? 'default' : 'outline'} className="rounded-md">
            {isOpen ? 'Open' : module.health}
          </Badge>
        </div>

        <p className="mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-muted-foreground">
          {module.description}
        </p>

        <Button
          type="button"
          onClick={onOpen}
          disabled={opening}
          className="mt-auto w-full justify-between"
          variant={isOpen ? 'secondary' : 'default'}
        >
          <span>{opening ? 'Opening...' : isOpen ? 'Focus window' : 'Launch app'}</span>
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}
