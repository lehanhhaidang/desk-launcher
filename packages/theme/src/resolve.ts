import type { ThemeConfig, ThemeFont, ThemeFontSize, ThemeMode } from './tokens'

// --- minimal sRGB/hex → OKLCH (so accent derivation needs no color library) ---

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const n = parseInt(h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Parse a hex or `oklch(L C H)` string into OKLCH components. */
export function toOklch(color: string): { l: number; c: number; h: number } | null {
  const ok = color.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i)
  if (ok) {
    let l = parseFloat(ok[1])
    if (ok[1].includes('%')) l /= 100
    return { l, c: parseFloat(ok[2]), h: parseFloat(ok[3]) }
  }
  const rgb = hexToRgb(color)
  if (!rgb) return null
  const [r, g, b] = rgb.map(srgbToLinear)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c: Math.hypot(a, bb), h }
}

const oklchStr = (o: { l: number; c: number; h: number }) =>
  `oklch(${o.l.toFixed(4)} ${o.c.toFixed(4)} ${o.h.toFixed(2)})`

/**
 * Derive the dual-tone brand pair from a single accent: the secondary tone
 * rotates the hue (keeping the cyan→violet character) and lightens slightly.
 */
export function deriveAccents(accent: string): { brand: string; brand2: string } {
  const o = toOklch(accent) ?? { l: 0.86, c: 0.12, h: 190 }
  return {
    brand: oklchStr(o),
    brand2: oklchStr({ l: Math.min(0.92, o.l + 0.02), c: o.c, h: (o.h + 110) % 360 }),
  }
}

export function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    const light =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches
    return light ? 'light' : 'dark'
  }
  return mode
}

export const FONT_STACKS: Record<ThemeFont, string> = {
  quicksand: "'Quicksand', ui-sans-serif, system-ui, sans-serif",
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', Menlo, monospace",
}

export const FONT_SIZES: Record<ThemeFontSize, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
}

export interface ResolvedTheme {
  mode: 'dark' | 'light'
  /** CSS custom properties to set on the document root. */
  vars: Record<string, string>
  rootFontSize: string
  reduceMotion: boolean
  background: ThemeConfig['background']
}

/** Pure: turn a config into everything the apply step needs. Unit-tested. */
export function resolve(cfg: ThemeConfig): ResolvedTheme {
  const { brand, brand2 } = deriveAccents(cfg.accent)
  return {
    mode: resolveMode(cfg.mode),
    vars: {
      '--brand': brand,
      '--brand-2': brand2,
      '--radius': `${cfg.radius}rem`,
      '--font-sans': FONT_STACKS[cfg.font] ?? FONT_STACKS.quicksand,
    },
    rootFontSize: FONT_SIZES[cfg.fontSize] ?? FONT_SIZES.md,
    reduceMotion: cfg.reduceMotion,
    background: cfg.background ?? 'aurora',
  }
}
