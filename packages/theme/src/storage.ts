import { DEFAULT_THEME, type ThemeConfig } from './tokens'

const storageKey = (appId: string) => `theme:${appId}`

/** Load a saved theme, merged onto defaults. Never throws. */
export function loadTheme(appId: string): ThemeConfig {
  try {
    const raw = localStorage.getItem(storageKey(appId))
    if (!raw) return DEFAULT_THEME
    return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<ThemeConfig>) }
  } catch {
    return DEFAULT_THEME
  }
}

/** Persist a theme. Never throws (private windows / disabled storage). */
export function saveTheme(appId: string, cfg: ThemeConfig): void {
  try {
    localStorage.setItem(storageKey(appId), JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}
