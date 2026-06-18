import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { applyTheme } from './apply'
import { loadTheme, saveTheme } from './storage'
import { DEFAULT_THEME, type ThemeConfig } from './tokens'

interface ThemeContextValue {
  theme: ThemeConfig
  setTheme: (patch: Partial<ThemeConfig>) => void
  reset: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Owns one app's theme. Loads the persisted config on mount, applies + saves
 * on every change, and (in `system` mode) re-applies when the OS scheme flips.
 * Each app passes its own `appId` so themes stay independent.
 */
export function ThemeProvider({ appId, children }: { appId: string; children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(() => loadTheme(appId))

  useEffect(() => {
    applyTheme(theme)
    saveTheme(appId, theme)
  }, [appId, theme])

  useEffect(() => {
    if (theme.mode !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(theme)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (patch) => setThemeState((t) => ({ ...t, ...patch })),
      reset: () => setThemeState(DEFAULT_THEME),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
