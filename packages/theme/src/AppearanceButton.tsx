import { useState, type ReactNode } from 'react'
import { ThemePicker } from './ThemePicker'

function PaletteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
    </svg>
  )
}

/**
 * A drop-in theme entry point for module windows: a palette button that opens
 * a themed popover hosting <ThemePicker>. Fully self-contained (React + tokens
 * only) so every module mirrors the launcher's Appearance feature identically.
 * Pass `className`/`children` to match the host toolbar's button styling.
 */
export function AppearanceButton({
  className,
  children,
  title = 'Appearance',
}: {
  className?: string
  children?: ReactNode
  title?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex size-9 items-center justify-center rounded-full transition-colors hover:opacity-80'
        }
        style={className ? undefined : { color: 'var(--text-muted)' }}
      >
        {children ?? <PaletteIcon />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] flex justify-end"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative m-4 mt-16 h-fit w-80 max-w-[90vw] overflow-y-auto rounded-xl border p-5 shadow-2xl"
            style={{
              maxHeight: 'calc(100vh - 5rem)',
              borderColor: 'var(--line)',
              background: 'var(--panel)',
              backdropFilter: 'blur(12px)',
              color: 'var(--text)',
            }}
          >
            <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Appearance
            </div>
            <ThemePicker />
          </div>
        </div>
      )}
    </>
  )
}
