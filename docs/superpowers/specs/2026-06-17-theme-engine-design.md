# Theme Engine — Design Spec

**Date:** 2026-06-17
**Status:** Approved
**Goal:** A self-contained, reusable theme feature (dark/light/system, custom accent, font/size/radius/motion) that each app instantiates independently — applied first in the launcher, then mirrored into each module.

## Scope (v1)

This spec covers the **shared theme engine** (`packages/theme`) and its **full integration into the launcher**. Mirroring into each module is a follow-up (one small spec/plan per module) that reuses this engine unchanged.

Themeable dimensions in v1:

- **Mode** — dark / light / follow-system.
- **Accent** — a primary accent color (preset swatches + free color picker); a secondary accent is auto-derived to keep the dual-tone identity.
- **Typography & shape** — font family, base font size, corner radius, reduced motion.

Out of scope (v2+): true spacing "density" (compact), per-app theme sync/export, preset *bundles* (a named combination of all settings), backend/SQLite persistence.

## Architecture: per-app, independent

Each app (launcher and — later — each module) themes **itself**. There is **no** launcher-as-master / cross-window broadcast. This keeps modules extractable as standalone apps.

- One shared implementation lives in **`packages/theme`** (DRY: the feature is identical everywhere, not copy-pasted).
- Each app provides its own `appId` and storage scope, so themes are independent: `localStorage["theme:" + appId]` (e.g. `theme:launcher`, `theme:myssh`). An extracted standalone module keeps working — same package, its own origin's storage.

## 1. Token model

A set of CSS custom properties set on `document.documentElement` at runtime; all CSS consumes them (nothing hardcodes brand colors anymore).

| Group | Tokens | Drives |
|---|---|---|
| Accent | `--accent`, `--accent-2` | buttons, highlights, glows, the cyan→purple gradients |
| Surfaces | `--bg`, `--surface`, `--panel`, `--panel-2` | window background + glass panels |
| Text | `--text`, `--text-muted`, `--text-faint` | text colors |
| Border | `--line` | borders |
| Shape | `--radius` | corner radius |
| Type | `--font-sans` + root `font-size` | family + scale |
| Motion | `data-reduce-motion` attribute on `<html>` | disables animations |

- **Colors use `oklch`** so changing the accent is a clean hue change and shades derive predictably.
- **Accent stays dual-tone:** the user picks one primary accent; `--accent-2` is auto-derived by rotating the hue (≈ +40°) so the cyan→purple character holds. A few preset swatches + a free color picker are offered.
- **Dark/Light:** two value sets for surfaces/text; the accent carries over (lightness nudged for contrast on light). `system` resolves via `matchMedia('(prefers-color-scheme: dark)')` and live-updates while selected.
- **Bridge to shadcn:** the existing shadcn variables (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--ring`, …) are redefined in terms of the tokens above, so `@desk-launcher/ui` components recolor too.

## 2. Engine — `packages/theme`

Files (each one focused responsibility):

- `tokens.ts` — `ThemeConfig` type + `DEFAULT_THEME` (the current Aurora look) + accent presets.
- `resolve.ts` — pure functions: resolve `mode` (system→dark/light), derive `--accent-2` from accent, map a `ThemeConfig` → a flat record of CSS-variable values. **Unit-tested.**
- `apply.ts` — `applyTheme(cfg)`: resolve then write CSS vars onto `documentElement`, toggle `.dark`, set `data-reduce-motion`, root `font-size`, `--radius`, `--font-sans`. `applyThemeFromStorage(appId)` for the pre-render call.
- `storage.ts` — `loadTheme(appId)` / `saveTheme(appId, cfg)` over `localStorage["theme:"+appId]`, merging onto `DEFAULT_THEME`.
- `provider.tsx` — `ThemeProvider({ appId, children })` React context: loads + applies on mount, re-applies on change, subscribes to the system color-scheme media query when `mode === 'system'`; exposes `useTheme() → { theme, setTheme, reset }`.
- `ThemePicker.tsx` — the UI: mode toggle, accent swatches + color input, font select, font-size select, radius slider, reduced-motion toggle, Reset. Built on `useTheme()`; every change applies instantly.
- `index.ts` — public exports.

`ThemeConfig = { mode: 'dark'|'light'|'system', accent: string, font: 'quicksand'|'system'|'inter'|'mono', fontSize: 'sm'|'md'|'lg', radius: number, reduceMotion: boolean }`.

**No flash of default theme (FOUC):** each app's `main.tsx` calls `applyThemeFromStorage(appId)` *before* `ReactDOM.createRoot(...).render(...)`. The `ThemeProvider` then owns it.

It is a new source-only package `packages/theme`, consumed via a `@desk-launcher/theme` alias added to `vite.config.ts` + `tsconfig.json` (mirroring `@desk-launcher/ui`). It depends only on React + the DOM (no launcher coupling), so a module taking it can be extracted standalone.

## 3. Launcher CSS migration ("wire carefully")

The launcher's brand styling is currently hardcoded hex/rgba. Migrate it to consume tokens so a future launcher redesign doesn't touch the engine:

- Add token defaults (dark + light value sets) to `packages/ui/src/theme.css` (the shared sheet every window already imports).
- Rewrite `apps/launcher/src/main.css`: replace hardcoded colors in `body`, `.launcher-bg`, `.launcher-panel`, `.launcher-form-section`, `.launcher-card`(+hover), `.launcher-lux-text`, `.launcher-modal`(+backdrop), `.launcher-input`/`.launcher-textarea`, `.launcher-primary-button`, and the scrollbar rules with `var(--accent)`, `var(--accent-2)`, `var(--panel)`, `var(--text)`, `var(--line)`, etc.
- Redefine the shadcn `:root` / `.dark` variables in terms of the tokens (the bridge).

Default token values reproduce today's look exactly, so the migration is visually a no-op until the user changes something.

## 4. Launcher integration

- `apps/launcher/src/main.tsx`: `applyThemeFromStorage('launcher')` before render; wrap `<App/>` in `<ThemeProvider appId="launcher">`.
- Mount `<ThemePicker/>` inside the launcher's existing **Settings modal** (currently a UI mockup in `Dashboard.tsx`). Decoupled, so a later launcher redesign just re-mounts the picker.

## 5. Persistence & scope

`localStorage["theme:launcher"]`. Independent per app. No cross-window coupling. Survives restart (WebView2 localStorage is persistent). A standalone-extracted module uses its own `appId` and its own origin's storage.

## 6. Defaults / reset

`DEFAULT_THEME` = the current Aurora look (dark, cyan/purple accent, Quicksand, default radius). Nothing changes visually until the user picks. **Reset** restores `DEFAULT_THEME`.

## 7. Testing

- **Unit (`resolve.ts`):** system-mode resolution, accent-2 derivation, `ThemeConfig` → CSS-var record (incl. light vs dark sets, font-size scale, radius). Pure functions, no DOM.
- **Manual:** in the launcher — switch mode/accent/font/size/radius/motion, confirm live apply, persistence across restart, no FOUC, and that `@desk-launcher/ui` components + the `.launcher-*` surfaces all recolor.

## 8. Build order

1. `packages/theme`: tokens + resolve (+ unit tests) → apply → storage → provider → ThemePicker. Add the alias (Vite + tsconfig).
2. Token defaults in `theme.css` + shadcn bridge.
3. Migrate `apps/launcher/src/main.css` to tokens (visual no-op).
4. Launcher wiring: `main.tsx` pre-apply + `ThemeProvider`; mount `<ThemePicker>` in the Settings modal.
5. Manual acceptance pass in the launcher.

(Mirroring into each module is a separate follow-up: point that module's CSS at the tokens, add `<ThemePicker>` to its UI, use its own `appId`.)
