import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { ArrowDown, ArrowUp, RotateCw, X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import {
  closeSession,
  onSessionData,
  onSessionExit,
  openSession,
  resizeSession,
  sendInput,
} from '../api/myssh-api'

interface Props {
  hostId: string
  /** Whether this terminal's tab is currently visible. */
  active: boolean
  /** Reports the live session id (or null when it ends) so the parent can
   *  route snippets to the active session. */
  onSession?: (sessionId: string | null) => void
}

const encoder = new TextEncoder()
const MIN_FONT = 8
const MAX_FONT = 28
const DEFAULT_FONT = 13

export function TerminalView({ hostId, active, onSession }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession
  // Disposes the current session's listeners + onData handler before a
  // reconnect or unmount, so we never double-wire.
  const teardownRef = useRef<() => void>(() => {})
  const startRef = useRef<() => Promise<void>>(async () => {})

  const [closed, setClosed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

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

    // Ctrl/Cmd+Shift+C copy, +V paste, +F search; Ctrl +/-/0 font zoom.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey && e.code === 'KeyC') {
        if (copySelection()) return false
        return true
      }
      if (mod && e.shiftKey && e.code === 'KeyV') {
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

    // Right-click: copy selection if any, else paste.
    const onContext = (ev: MouseEvent) => {
      ev.preventDefault()
      if (!copySelection()) pasteClipboard()
    }
    container.addEventListener('contextmenu', onContext)

    const startSession = async () => {
      teardownRef.current()
      setClosed(false)
      term.writeln('\x1b[2m[connecting…]\x1b[0m')
      try {
        const sessionId = await openSession(hostId, term.cols, term.rows)
        sessionIdRef.current = sessionId
        onSessionRef.current?.(sessionId)

        const unlistenData: UnlistenFn = await onSessionData(sessionId, (bytes) => term.write(bytes))
        const unlistenExit: UnlistenFn = await onSessionExit(sessionId, () => {
          term.write('\r\n\x1b[33m[session closed]\x1b[0m\r\n')
          onSessionRef.current?.(null)
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
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-white/10 bg-[#11141b] px-2 py-1 shadow-lg">
          <input
            autoFocus
            className="w-40 bg-transparent text-sm text-[#edf3f7] outline-none"
            placeholder="Find…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <button className="text-[#9aa6b6] hover:text-cyan-300" title="Previous" onClick={() => runSearch('prev')}>
            <ArrowUp className="size-3.5" />
          </button>
          <button className="text-[#9aa6b6] hover:text-cyan-300" title="Next" onClick={() => runSearch('next')}>
            <ArrowDown className="size-3.5" />
          </button>
          <button className="text-[#9aa6b6] hover:text-[#ffb4ab]" title="Close" onClick={() => setSearchOpen(false)}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {closed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <button
            className="flex items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20"
            onClick={() => startRef.current()}
          >
            <RotateCw className="size-4" /> Reconnect
          </button>
        </div>
      )}

      <div ref={containerRef} className="myssh-term h-full w-full" />
    </div>
  )
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
