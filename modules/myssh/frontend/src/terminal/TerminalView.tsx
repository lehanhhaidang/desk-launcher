import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { ArrowDown, ArrowUp, ClipboardPaste, Copy, RotateCw, Settings2, X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import {
  closeSession,
  listSnippets,
  onSessionData,
  onSessionExit,
  openSession,
  resizeSession,
  sendInput,
  type Snippet,
} from '../api/myssh-api'

export type ConnStatus = 'connecting' | 'connected' | 'closed'

interface Props {
  hostId: string
  /** Whether this terminal's tab is currently visible. */
  active: boolean
  /** Reports the live session id (or null when it ends) so the parent can
   *  route snippets to the active session. */
  onSession?: (sessionId: string | null) => void
  /** Reports the connection status for the tab indicator. */
  onStatus?: (status: ConnStatus) => void
  /** Open the snippets manager scoped to this host (from the right-click menu). */
  onManageCommands?: (hostId: string) => void
}

const encoder = new TextEncoder()
const MIN_FONT = 8
const MAX_FONT = 28
const DEFAULT_FONT = 13

export function TerminalView({ hostId, active, onSession, onStatus, onManageCommands }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  // Disposes the current session's listeners + onData handler before a
  // reconnect or unmount, so we never double-wire.
  const teardownRef = useRef<() => void>(() => {})
  const startRef = useRef<() => Promise<void>>(async () => {})

  const [closed, setClosed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [commands, setCommands] = useState<Snippet[]>([])
  // Bridges to the terminal's copy/paste/insert helpers (defined inside the
  // session effect) so the React-rendered context menu can call them.
  const copyRef = useRef<() => boolean>(() => false)
  const pasteRef = useRef<() => void>(() => {})
  const insertRef = useRef<(text: string) => void>(() => {})

  const loadCommands = useCallback(() => {
    listSnippets()
      .then((all) => setCommands(all.filter((s) => s.hostId === hostId || s.hostId == null)))
      .catch(() => {})
  }, [hostId])

  // Refresh commands each time the menu opens; close it on Escape.
  useEffect(() => {
    if (!menu) return
    loadCommands()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, loadCommands])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, monospace',
      fontSize: DEFAULT_FONT,
      cursorBlink: true,
      theme: {
        background: '#0a0c11',
        foreground: '#e6edf3',
        cursor: '#7ceee6',
        selectionBackground: 'rgba(124,238,230,0.25)',
      },
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    const copySelection = () => {
      const sel = term.getSelection()
      if (sel) void navigator.clipboard?.writeText(sel).catch(() => {})
      return !!sel
    }
    const pasteClipboard = () => {
      navigator.clipboard
        ?.readText()
        .then((t) => {
          if (t) term.paste(t)
        })
        .catch(() => {})
    }
    // Type text onto the prompt without a trailing newline, so the user can
    // review/edit it and press Enter to run.
    const insertText = (text: string) => {
      const id = sessionIdRef.current
      if (id) sendInput(id, Array.from(encoder.encode(text))).catch(() => {})
      term.focus()
    }
    copyRef.current = copySelection
    pasteRef.current = pasteClipboard
    insertRef.current = insertText

    // Ctrl/Cmd+Shift+C copy, +V paste, +F search; Ctrl +/-/0 font zoom.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const mod = e.ctrlKey || e.metaKey
      // Ctrl/Cmd+C copies when there's a selection, else passes through as the
      // interrupt (SIGINT). Ctrl/Cmd+Shift+C always copies.
      if (mod && !e.shiftKey && e.code === 'KeyC') {
        if (copySelection()) return false
        return true
      }
      if (mod && e.shiftKey && e.code === 'KeyC') {
        if (copySelection()) return false
        return true
      }
      // Paste on Ctrl/Cmd+V (and +Shift+V). Plain Ctrl+V matches the Windows
      // convention; a terminal rarely needs the literal-insert it would shadow.
      if (mod && e.code === 'KeyV') {
        pasteClipboard()
        return false
      }
      if (mod && e.shiftKey && e.code === 'KeyF') {
        setSearchOpen((v) => !v)
        return false
      }
      if (mod && !e.shiftKey && (e.code === 'Equal' || e.code === 'Minus' || e.code === 'Digit0')) {
        const cur = term.options.fontSize ?? DEFAULT_FONT
        const next =
          e.code === 'Digit0'
            ? DEFAULT_FONT
            : e.code === 'Equal'
              ? Math.min(cur + 1, MAX_FONT)
              : Math.max(cur - 1, MIN_FONT)
        term.options.fontSize = next
        try {
          fit.fit()
        } catch {
          /* ignore */
        }
        return false
      }
      return true
    })

    // Right-click opens the command menu (copy/paste + this host's commands).
    const onContext = (ev: MouseEvent) => {
      ev.preventDefault()
      setMenu({ x: ev.clientX, y: ev.clientY })
    }
    container.addEventListener('contextmenu', onContext)

    const startSession = async () => {
      teardownRef.current()
      setClosed(false)
      onStatusRef.current?.('connecting')
      term.writeln('\x1b[2m[connecting…]\x1b[0m')
      try {
        const sessionId = await openSession(hostId, term.cols, term.rows)
        sessionIdRef.current = sessionId
        onSessionRef.current?.(sessionId)
        onStatusRef.current?.('connected')

        const unlistenData: UnlistenFn = await onSessionData(sessionId, (bytes) => term.write(bytes))
        const unlistenExit: UnlistenFn = await onSessionExit(sessionId, () => {
          term.write('\r\n\x1b[33m[session closed]\x1b[0m\r\n')
          onSessionRef.current?.(null)
          onStatusRef.current?.('closed')
          setClosed(true)
        })
        const onData = term.onData((d) => {
          sendInput(sessionId, Array.from(encoder.encode(d))).catch(() => {})
        })

        teardownRef.current = () => {
          unlistenData()
          unlistenExit()
          onData.dispose()
          closeSession(sessionId).catch(() => {})
          if (sessionIdRef.current === sessionId) sessionIdRef.current = null
          teardownRef.current = () => {}
        }
      } catch (e) {
        term.write(`\r\n\x1b[31mConnection failed: ${errMessage(e)}\x1b[0m\r\n`)
        onStatusRef.current?.('closed')
        setClosed(true)
      }
    }
    startRef.current = startSession
    void startSession()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* container not measurable yet */
      }
      const id = sessionIdRef.current
      if (id) resizeSession(id, term.cols, term.rows).catch(() => {})
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      container.removeEventListener('contextmenu', onContext)
      teardownRef.current()
      onSessionRef.current?.(null)
      term.dispose()
    }
  }, [hostId])

  // When this tab becomes active, refit and focus.
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
      const id = sessionIdRef.current
      const term = termRef.current
      if (id && term) resizeSession(id, term.cols, term.rows).catch(() => {})
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  const runSearch = (dir: 'next' | 'prev', termStr = searchTerm) => {
    if (!termStr) return
    if (dir === 'next') searchRef.current?.findNext(termStr)
    else searchRef.current?.findPrevious(termStr)
  }

  return (
    <div className="relative h-full w-full">
      {searchOpen && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-white/10 bg-[var(--panel)] px-2 py-1 shadow-lg">
          <input
            autoFocus
            className="w-40 bg-transparent text-sm text-[var(--text)] outline-none"
            placeholder="Find…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <button className="text-[var(--text-muted)] hover:text-[var(--brand)]" title="Previous" onClick={() => runSearch('prev')}>
            <ArrowUp className="size-3.5" />
          </button>
          <button className="text-[var(--text-muted)] hover:text-[var(--brand)]" title="Next" onClick={() => runSearch('next')}>
            <ArrowDown className="size-3.5" />
          </button>
          <button className="text-[var(--text-muted)] hover:text-[#ffb4ab]" title="Close" onClick={() => setSearchOpen(false)}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {closed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <button
            className="flex items-center gap-2 rounded-md border border-[color-mix(in_oklch,var(--brand)_30%,transparent)] bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] px-4 py-2 text-sm font-medium text-[var(--brand)] transition hover:bg-[color-mix(in_oklch,var(--brand)_20%,transparent)]"
            onClick={() => startRef.current()}
          >
            <RotateCw className="size-4" /> Reconnect
          </button>
        </div>
      )}

      <div ref={containerRef} className="myssh-term h-full w-full" />

      {menu &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000]"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          >
            <div
              className="absolute min-w-56 max-w-72 overflow-hidden rounded-lg border py-1 text-sm shadow-2xl"
              style={{
                left: Math.max(4, Math.min(menu.x, window.innerWidth - 244)),
                top: Math.max(4, Math.min(menu.y, window.innerHeight - 340)),
                borderColor: 'var(--line)',
                background: 'var(--panel)',
                backdropFilter: 'blur(12px)',
                color: 'var(--text)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem
                icon={<Copy className="size-3.5" />}
                disabled={!termRef.current?.hasSelection()}
                onClick={() => {
                  copyRef.current()
                  setMenu(null)
                }}
              >
                Copy
              </MenuItem>
              <MenuItem
                icon={<ClipboardPaste className="size-3.5" />}
                onClick={() => {
                  pasteRef.current()
                  setMenu(null)
                }}
              >
                Paste
              </MenuItem>

              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                Commands
              </div>
              <div className="max-h-56 overflow-y-auto">
                {commands.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[var(--text-faint)]">No saved commands</div>
                ) : (
                  commands.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        insertRef.current(s.command)
                        setMenu(null)
                      }}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition hover:bg-white/5"
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        {s.hostId == null && (
                          <span className="ml-auto shrink-0 rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-[var(--text-faint)]">
                            all
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate font-mono text-xs text-[var(--text-faint)]">
                        {s.command}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
              <MenuItem
                icon={<Settings2 className="size-3.5" />}
                onClick={() => {
                  onManageCommands?.(hostId)
                  setMenu(null)
                }}
              >
                Manage commands…
              </MenuItem>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  icon,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
