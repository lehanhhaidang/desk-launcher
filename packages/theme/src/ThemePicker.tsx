import { useTheme } from './provider'
import {
  ACCENT_PRESETS,
  type ThemeFont,
  type ThemeFontSize,
  type ThemeMode,
} from './tokens'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const FONTS: { value: ThemeFont; label: string }[] = [
  { value: 'quicksand', label: 'Quicksand' },
  { value: 'system', label: 'System' },
  { value: 'mono', label: 'Mono' },
]

const SIZES: { value: ThemeFontSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background/40 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              active
                ? { background: 'var(--brand)', color: '#08110f' }
                : undefined
            }
          >
            <span className={active ? '' : 'text-muted-foreground'}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Self-contained theme controls. Drop inside any app already wrapped in a
 * `ThemeProvider`. Styled only with shared tokens, so it looks at home in the
 * launcher and every module, and recolors with the theme it edits.
 */
export function ThemePicker() {
  const { theme, setTheme, reset } = useTheme()

  return (
    <div className="space-y-6">
      <Field label="Appearance">
        <Segmented
          options={MODES}
          value={theme.mode}
          onChange={(mode) => setTheme({ mode })}
        />
      </Field>

      <Field label="Accent">
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => {
            const active = p.value.toLowerCase() === theme.accent.toLowerCase()
            return (
              <button
                key={p.value}
                type="button"
                title={p.name}
                onClick={() => setTheme({ accent: p.value })}
                className="size-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: p.value,
                  borderColor: active ? 'var(--text, #fff)' : 'transparent',
                }}
              />
            )
          })}
          <label
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
            title="Custom color"
          >
            <span className="text-lg leading-none">+</span>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(theme.accent) ? theme.accent : '#7ceee6'}
              onChange={(e) => setTheme({ accent: e.target.value })}
              className="sr-only"
            />
          </label>
        </div>
      </Field>

      <Field label="Font">
        <Segmented
          options={FONTS}
          value={theme.font}
          onChange={(font) => setTheme({ font })}
        />
      </Field>

      <Field label="Text size">
        <Segmented
          options={SIZES}
          value={theme.fontSize}
          onChange={(fontSize) => setTheme({ fontSize })}
        />
      </Field>

      <Field label={`Corner radius — ${theme.radius.toFixed(2)}rem`}>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={theme.radius}
          onChange={(e) => setTheme({ radius: Number(e.target.value) })}
          className="w-full accent-[var(--brand)]"
          style={{ accentColor: 'var(--brand)' }}
        />
      </Field>

      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-sm font-medium">Reduce motion</span>
        <input
          type="checkbox"
          checked={theme.reduceMotion}
          onChange={(e) => setTheme({ reduceMotion: e.target.checked })}
          className="size-4"
          style={{ accentColor: 'var(--brand)' }}
        />
      </label>

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Reset to default
        </button>
      </div>
    </div>
  )
}
