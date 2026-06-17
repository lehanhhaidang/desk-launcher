import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME } from './tokens'
import { deriveAccents, resolve, resolveMode, toOklch } from './resolve'

describe('toOklch', () => {
  it('parses hex into OKLCH components', () => {
    const white = toOklch('#ffffff')!
    expect(white.l).toBeGreaterThan(0.99)
    expect(white.c).toBeLessThan(0.01)

    const black = toOklch('#000000')!
    expect(black.l).toBeLessThan(0.01)
  })

  it('accepts 3-digit hex and existing oklch strings', () => {
    expect(toOklch('#fff')!.l).toBeGreaterThan(0.99)
    const parsed = toOklch('oklch(0.7 0.1 200)')!
    expect(parsed).toMatchObject({ l: 0.7, c: 0.1, h: 200 })
  })

  it('returns null for garbage', () => {
    expect(toOklch('not-a-color')).toBeNull()
  })
})

describe('deriveAccents', () => {
  it('rotates the secondary hue by 110 degrees', () => {
    const base = toOklch('#7ceee6')!
    const { brand, brand2 } = deriveAccents('#7ceee6')
    expect(brand).toMatch(/^oklch\(/)
    expect(brand2).toMatch(/^oklch\(/)
    const h2 = Number(brand2.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)/)![1])
    expect(h2).toBeCloseTo((base.h + 110) % 360, 0)
  })

  it('falls back gracefully on an invalid accent', () => {
    expect(deriveAccents('xyz').brand).toMatch(/^oklch\(/)
  })
})

describe('resolveMode', () => {
  it('passes through explicit modes', () => {
    expect(resolveMode('dark')).toBe('dark')
    expect(resolveMode('light')).toBe('light')
  })

  it('defaults system to dark without a matchMedia match', () => {
    expect(resolveMode('system')).toBe('dark')
  })
})

describe('resolve', () => {
  it('maps the default theme to a no-op-friendly var set', () => {
    const r = resolve(DEFAULT_THEME)
    expect(r.mode).toBe('dark')
    expect(r.vars['--brand']).toMatch(/^oklch\(/)
    expect(r.vars['--brand-2']).toMatch(/^oklch\(/)
    expect(r.vars['--radius']).toBe('0.625rem')
    expect(r.vars['--font-sans']).toContain('Quicksand')
    expect(r.rootFontSize).toBe('16px')
    expect(r.reduceMotion).toBe(false)
  })

  it('scales font size and radius from config', () => {
    expect(resolve({ ...DEFAULT_THEME, fontSize: 'sm' }).rootFontSize).toBe('14px')
    expect(resolve({ ...DEFAULT_THEME, fontSize: 'lg' }).rootFontSize).toBe('18px')
    expect(resolve({ ...DEFAULT_THEME, radius: 1 }).vars['--radius']).toBe('1rem')
    expect(resolve({ ...DEFAULT_THEME, font: 'mono' }).vars['--font-sans']).toContain('mono')
    expect(resolve({ ...DEFAULT_THEME, reduceMotion: true }).reduceMotion).toBe(true)
  })
})
