export type ThemeMode = 'dark' | 'light' | 'system'
export type ThemeFont = 'quicksand' | 'system' | 'mono'
export type ThemeFontSize = 'sm' | 'md' | 'lg'

export interface ThemeConfig {
  mode: ThemeMode
  /** Primary accent as any CSS color the picker emits (hex or oklch). */
  accent: string
  font: ThemeFont
  fontSize: ThemeFontSize
  /** Corner radius in rem. */
  radius: number
  reduceMotion: boolean
}

/** The current "Aurora" look — applying this is a visual no-op. */
export const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  accent: '#7ceee6',
  font: 'quicksand',
  fontSize: 'md',
  radius: 0.625,
  reduceMotion: false,
}

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Aurora', value: '#7ceee6' },
  { name: 'Emerald', value: '#5eead4' },
  { name: 'Violet', value: '#b79cff' },
  { name: 'Sky', value: '#7cc4ff' },
  { name: 'Rose', value: '#ff9ec4' },
  { name: 'Amber', value: '#ffcf8a' },
]
