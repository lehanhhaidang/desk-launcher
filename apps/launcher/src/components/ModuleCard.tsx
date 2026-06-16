import type { ModuleDescriptor } from '../modules/registry'
import { Button } from '@desk-launcher/ui'
import {
  Download,
  FileText,
  FolderOpen,
  Languages,
  Rocket,
  Terminal,
  type LucideIcon,
} from 'lucide-react'

interface Props {
  module: ModuleDescriptor
  opening: boolean
  isOpen: boolean
  onOpen: () => void
}

type Accent = {
  icon: string
  chip: string
  button: string
  wash: string
  glow: string
}

const accentMap: Record<string, Accent> = {
  myssh: {
    icon: 'text-cyan-200 shadow-[0_0_18px_rgba(124,238,230,0.14)]',
    chip: 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100',
    button: 'bg-cyan-200 text-[#071413] hover:bg-cyan-100',
    wash: 'from-cyan-200/16 via-cyan-200/5 to-transparent',
    glow: 'bg-cyan-200/25',
  },
  'open-sesame': {
    icon: 'text-emerald-200 shadow-[0_0_18px_rgba(124,238,230,0.13)]',
    chip: 'border-emerald-200/30 bg-emerald-200/10 text-emerald-100',
    button: 'bg-emerald-200 text-[#071413] hover:bg-emerald-100',
    wash: 'from-emerald-200/15 via-emerald-200/5 to-transparent',
    glow: 'bg-emerald-200/25',
  },
  comtor: {
    icon: 'text-fuchsia-200 shadow-[0_0_18px_rgba(239,137,214,0.13)]',
    chip: 'border-fuchsia-200/30 bg-fuchsia-200/10 text-fuchsia-100',
    button: 'bg-fuchsia-200 text-[#17101a] hover:bg-fuchsia-100',
    wash: 'from-fuchsia-200/14 via-fuchsia-200/5 to-transparent',
    glow: 'bg-fuchsia-200/24',
  },
  'video-downloader': {
    icon: 'text-violet-200 shadow-[0_0_18px_rgba(183,156,255,0.14)]',
    chip: 'border-violet-200/30 bg-violet-200/10 text-violet-100',
    button: 'bg-violet-200 text-[#14101c] hover:bg-violet-100',
    wash: 'from-violet-200/16 via-violet-200/5 to-transparent',
    glow: 'bg-violet-200/24',
  },
  'md-converter': {
    icon: 'text-amber-100 shadow-[0_0_18px_rgba(255,188,134,0.12)]',
    chip: 'border-amber-100/30 bg-amber-100/10 text-amber-100',
    button: 'bg-amber-100 text-[#17110a] hover:bg-amber-50',
    wash: 'from-amber-100/14 via-amber-100/5 to-transparent',
    glow: 'bg-amber-100/22',
  },
}

const iconMap: Record<ModuleDescriptor['icon'], LucideIcon> = {
  terminal: Terminal,
  'book-open': FolderOpen,
  languages: Languages,
  download: Download,
  'file-text': FileText,
}

const statusLabel: Record<string, string> = {
  myssh: 'Beta',
  'open-sesame': 'Active',
  comtor: 'Beta',
  'video-downloader': 'Ready',
  'md-converter': 'Beta',
}

export function ModuleCard({ module, opening, isOpen, onOpen }: Props) {
  const Icon = iconMap[module.icon]
  const accent = accentMap[module.id] ?? accentMap['video-downloader']
  const label = isOpen ? 'Active' : statusLabel[module.id] ?? module.health

  return (
    <article
      className="launcher-card group relative flex min-h-[248px] cursor-pointer flex-col overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
      onDoubleClick={onOpen}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accent.wash}`} />
      <div className={`pointer-events-none absolute -right-8 -top-10 size-24 rounded-full transition-opacity duration-200 ${accent.glow} opacity-0 group-hover:opacity-35`} />

      <div className="mb-4 flex items-start justify-between">
        <div
          className={`relative flex size-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] transition-all duration-200 group-hover:border-white/20 ${accent.icon}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <span
          className={`relative rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase leading-4 tracking-wider ${accent.chip}`}
        >
          {isOpen && <span className="absolute -left-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-emerald-400" />}
          {label}
        </span>
      </div>

      <h3 className="relative mb-2 text-lg font-semibold leading-6 text-[#edf3f7]">{module.displayName}</h3>
      <p className="relative mb-6 line-clamp-3 flex-grow text-sm leading-6 text-[#aeb8c7]">{module.description}</p>

      <div className="relative mt-auto border-t border-white/[0.08] pt-4">
        <Button
          type="button"
          onClick={onOpen}
          disabled={opening}
          className={`h-9 w-full gap-2 rounded-lg text-sm font-semibold shadow-[0_10px_26px_rgba(0,0,0,0.18)] transition-all ${accent.button}`}
        >
          <span>Launch</span>
          <Rocket className="size-[18px]" aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}
