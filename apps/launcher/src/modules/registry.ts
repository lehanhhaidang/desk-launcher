// Source of truth for which modules the launcher offers.
// Add new modules here as they come online. The Rust side has its
// own mirror of this registry (see src-tauri/src/module_registry.rs)
// because Tauri compiles modules in at build time — keeping the two
// in sync is part of adding a module.

export type ModuleCategory = 'productivity' | 'media' | 'dev' | 'utility'
export type ModuleIcon = 'terminal' | 'book-open' | 'languages' | 'download' | 'file-text'

export interface ModuleWindowConfig {
  title: string
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  /** Vite multi-page entry path, relative to launcher frontendDist. */
  initialUrl: string
}

export interface ModuleDescriptor {
  id: string
  displayName: string
  shortName: string
  description: string
  icon: ModuleIcon
  category: ModuleCategory
  accentClass: string
  health: 'ready' | 'beta'
  windowConfig: ModuleWindowConfig
}

export const MODULES: readonly ModuleDescriptor[] = [
  {
    id: 'myssh',
    displayName: 'MySSH',
    shortName: 'SSH',
    description: 'Termius-style SSH client: managed hosts, multi-tab terminals, snippets, and port forwarding.',
    icon: 'terminal',
    category: 'dev',
    accentClass: 'from-sky-500/20 to-cyan-400/10 text-sky-300 border-sky-400/20',
    health: 'beta',
    windowConfig: {
      title: 'MySSH',
      width: 1280,
      height: 820,
      minWidth: 1000,
      minHeight: 640,
      initialUrl: 'modules-pages/myssh/index.html',
    },
  },
  {
    id: 'open-sesame',
    displayName: 'Open Sesame',
    shortName: 'Docs',
    description: 'Project documentation workspace with GitHub sync, file tree, and Markdown preview.',
    icon: 'book-open',
    category: 'productivity',
    accentClass: 'from-emerald-500/20 to-lime-400/10 text-emerald-300 border-emerald-400/20',
    health: 'ready',
    windowConfig: {
      title: 'Open Sesame',
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      initialUrl: 'modules-pages/open-sesame/index.html',
    },
  },
  {
    id: 'comtor',
    displayName: 'Virtual Comtor',
    shortName: 'Comtor',
    description: 'Real-time Japanese and Vietnamese meeting interpreter with transcript and summary tools.',
    icon: 'languages',
    category: 'productivity',
    accentClass: 'from-fuchsia-500/20 to-rose-400/10 text-fuchsia-300 border-fuchsia-400/20',
    health: 'ready',
    windowConfig: {
      title: 'Virtual Comtor',
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      initialUrl: 'modules-pages/comtor/index.html',
    },
  },
  {
    id: 'video-downloader',
    displayName: 'Media Toolbox',
    shortName: 'Media',
    description: 'Capture links and prepare local image/video workflows with yt-dlp and ffmpeg.',
    icon: 'download',
    category: 'media',
    accentClass: 'from-violet-500/20 to-purple-400/10 text-violet-300 border-violet-400/20',
    health: 'beta',
    windowConfig: {
      title: 'Media Toolbox',
      width: 1100,
      height: 760,
      minWidth: 800,
      minHeight: 500,
      initialUrl: 'modules-pages/video-downloader/index.html',
    },
  },
  {
    id: 'md-converter',
    displayName: 'Markdown Converter',
    shortName: 'MD',
    description: 'Convert Office, PDF, HTML, EPUB and more to Markdown — Rust port of Microsoft MarkItDown.',
    icon: 'file-text',
    category: 'utility',
    accentClass: 'from-amber-500/20 to-orange-400/10 text-amber-300 border-amber-400/20',
    health: 'beta',
    windowConfig: {
      title: 'Markdown Converter',
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      initialUrl: 'modules-pages/md-converter/index.html',
    },
  },
] as const
