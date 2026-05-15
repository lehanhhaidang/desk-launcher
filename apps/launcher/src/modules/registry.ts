// Source of truth for which modules the launcher offers.
// Add new modules here as they come online. The Rust side has its
// own mirror of this registry (see src-tauri/src/module_registry.rs)
// because Tauri compiles modules in at build time — keeping the two
// in sync is part of adding a module.

export type ModuleCategory = 'productivity' | 'media' | 'dev' | 'utility'
export type ModuleIcon = 'plug' | 'book-open' | 'languages' | 'download'

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
    id: 'port-killer',
    displayName: 'Port Killer',
    shortName: 'Ports',
    description: 'Inspect listening ports, clean up stuck processes, and manage SSH tunnels.',
    icon: 'plug',
    category: 'dev',
    accentClass: 'from-sky-500/20 to-cyan-400/10 text-sky-300 border-sky-400/20',
    health: 'ready',
    windowConfig: {
      title: 'Port Killer',
      width: 1100,
      height: 720,
      minWidth: 800,
      minHeight: 500,
      initialUrl: 'modules-pages/port-killer/index.html',
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
    displayName: 'Video Downloader',
    shortName: 'Video',
    description: 'Download videos/audio from YouTube, TikTok, Bilibili and more via bundled yt-dlp + ffmpeg.',
    icon: 'download',
    category: 'media',
    accentClass: 'from-violet-500/20 to-purple-400/10 text-violet-300 border-violet-400/20',
    health: 'beta',
    windowConfig: {
      title: 'Video Downloader',
      width: 1100,
      height: 760,
      minWidth: 800,
      minHeight: 500,
      initialUrl: 'modules-pages/video-downloader/index.html',
    },
  },
] as const
