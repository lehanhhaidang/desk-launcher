import { resolve } from './resolve'
import { loadTheme } from './storage'
import type { ThemeConfig } from './tokens'

/**
 * Write a theme onto the document root: toggle `.dark`, set the brand/radius/
 * font CSS variables, the root font-size scale, and the reduce-motion flag.
 * Safe to call in non-DOM contexts (no-op).
 */
export function applyTheme(cfg: ThemeConfig): void {
  if (typeof document === 'undefined') return
  const r = resolve(cfg)
  const root = document.documentElement
  root.classList.toggle('dark', r.mode === 'dark')
  for (const [k, v] of Object.entries(r.vars)) root.style.setProperty(k, v)
  root.style.fontSize = r.rootFontSize
  root.setAttribute('data-bg', r.background)
  if (r.reduceMotion) root.setAttribute('data-reduce-motion', 'true')
  else root.removeAttribute('data-reduce-motion')
}

/**
 * Apply the persisted theme for an app before React mounts — call this at the
 * top of `main.tsx` to avoid a flash of the default theme (FOUC).
 */
export function applyThemeFromStorage(appId: string): void {
  applyTheme(loadTheme(appId))
}
