import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { UnlistenFn } from '@tauri-apps/api/event'
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

export function TerminalView({ hostId, active, onSession }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0a0c11',
        foreground: '#e6edf3',
        cursor: '#7ceee6',
        selectionBackground: 'rgba(124,238,230,0.25)',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    let unlistenData: UnlistenFn | undefined
    let unlistenExit: UnlistenFn | undefined
    let disposed = false

    const start = async () => {
      try {
        const sessionId = await openSession(hostId, term.cols, term.rows)
        if (disposed) {
          closeSession(sessionId).catch(() => {})
          return
        }
        sessionIdRef.current = sessionId
        onSessionRef.current?.(sessionId)
        unlistenData = await onSessionData(sessionId, (bytes) => term.write(bytes))
        unlistenExit = await onSessionExit(sessionId, () => {
          term.write('\r\n\x1b[33m[session closed]\x1b[0m\r\n')
        })
        term.onData((d) => {
          sendInput(sessionId, Array.from(encoder.encode(d))).catch(() => {})
        })
      } catch (e) {
        term.write(`\r\n\x1b[31mConnection failed: ${errMessage(e)}\x1b[0m\r\n`)
      }
    }
    void start()

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
      disposed = true
      ro.disconnect()
      unlistenData?.()
      unlistenExit?.()
      const id = sessionIdRef.current
      if (id) closeSession(id).catch(() => {})
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

  return <div ref={containerRef} className="myssh-term h-full w-full" />
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
