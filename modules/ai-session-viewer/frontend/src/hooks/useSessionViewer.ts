import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listProviders,
  listProjects,
  listSessions,
  readSession,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
} from '../api/ai-session-viewer-api'
import type { ProviderInfo, ProjectEntry, SessionEntry, ChatMessage } from '../types'

function errMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}

/** Live session re-read cadence and list refresh cadence. */
const LIVE_POLL_MS = 5000
const LIST_POLL_MS = 5 * 60 * 1000

/** Cheap equality: same count and same last-message shape. */
function sameMessages(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  const la = a[a.length - 1]
  const lb = b[b.length - 1]
  return la.role === lb.role && la.content.length === lb.content.length
}

export function useSessionViewer() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providerId, setProviderId] = useState<string | null>(null)
  const [basePath, setBasePath] = useState('')

  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [projectPath, setProjectPath] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [sessionPath, setSessionPath] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])

  const [loading, setLoading] = useState({
    projects: false,
    sessions: false,
    messages: false,
  })
  const [error, setError] = useState<string | null>(null)

  // True once projects have been loaded at least once — gates background polling.
  const loadedOnce = useRef(false)

  const provider = providers.find((p) => p.id === providerId) ?? null

  // Load the provider catalog once.
  useEffect(() => {
    listProviders()
      .then((list) => {
        setProviders(list)
        const first = list[0]
        if (first) {
          setProviderId(first.id)
          setBasePath(first.defaultBasePath ?? '')
        }
      })
      .catch((e) => setError(errMessage(e)))
  }, [])

  const selectProvider = useCallback(
    (id: string) => {
      const next = providers.find((p) => p.id === id)
      setProviderId(id)
      setBasePath(next?.defaultBasePath ?? '')
      setProjects([])
      setProjectPath(null)
      setSessions([])
      setSessionPath(null)
      setMessages([])
      setError(null)
    },
    [providers],
  )

  const loadProjects = useCallback(
    async (override?: string) => {
      const target = (override ?? basePath).trim()
      if (!target) {
        setError('Enter or browse to a sessions folder first.')
        return
      }
      if (override !== undefined) setBasePath(override)
      setError(null)
      setLoading((s) => ({ ...s, projects: true }))
      setProjects([])
      setProjectPath(null)
      setSessions([])
      setSessionPath(null)
      setMessages([])
      try {
        setProjects(await listProjects(target))
        loadedOnce.current = true
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setLoading((s) => ({ ...s, projects: false }))
      }
    },
    [basePath],
  )

  // Manual refresh of the project list, preserving the current selection.
  const refreshProjects = useCallback(async () => {
    if (!basePath.trim()) return
    try {
      setProjects(await listProjects(basePath.trim()))
    } catch (e) {
      setError(errMessage(e))
    }
  }, [basePath])

  const selectProject = useCallback(async (project: ProjectEntry) => {
    setProjectPath(project.path)
    setSessions([])
    setSessionPath(null)
    setMessages([])
    setError(null)
    setLoading((s) => ({ ...s, sessions: true }))
    try {
      setSessions(await listSessions(project.path))
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setLoading((s) => ({ ...s, sessions: false }))
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    if (!projectPath) return
    try {
      setSessions(await listSessions(projectPath))
    } catch (e) {
      setError(errMessage(e))
    }
  }, [projectPath])

  const deleteSession = useCallback(
    async (session: SessionEntry) => {
      setError(null)
      try {
        await apiDeleteSession(session.path)
        if (sessionPath === session.path) {
          setSessionPath(null)
          setMessages([])
        }
        await refreshSessions()
      } catch (e) {
        setError(errMessage(e))
      }
    },
    [sessionPath, refreshSessions],
  )

  const renameSession = useCallback(
    async (session: SessionEntry, newName: string) => {
      setError(null)
      try {
        const newPath = await apiRenameSession(session.path, newName)
        if (sessionPath === session.path) setSessionPath(newPath)
        await refreshSessions()
      } catch (e) {
        setError(errMessage(e))
      }
    },
    [sessionPath, refreshSessions],
  )

  const selectSession = useCallback(async (session: SessionEntry) => {
    setSessionPath(session.path)
    setMessages([])
    setError(null)
    setLoading((s) => ({ ...s, messages: true }))
    try {
      setMessages(await readSession(session.path))
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setLoading((s) => ({ ...s, messages: false }))
    }
  }, [])

  // Manual re-read of the open session (refresh button).
  const refreshActiveSession = useCallback(async () => {
    if (!sessionPath) return
    try {
      const next = await readSession(sessionPath)
      setMessages((prev) => (sameMessages(prev, next) ? prev : next))
    } catch (e) {
      setError(errMessage(e))
    }
  }, [sessionPath])

  // Live-tail the open session: re-read on an interval, update only on change.
  useEffect(() => {
    if (!sessionPath) return
    const id = setInterval(async () => {
      try {
        const next = await readSession(sessionPath)
        setMessages((prev) => (sameMessages(prev, next) ? prev : next))
      } catch {
        // transient read error (file mid-write) — ignore, next tick retries
      }
    }, LIVE_POLL_MS)
    return () => clearInterval(id)
  }, [sessionPath])

  // Periodically refresh the project (and current session) lists so newly
  // created sessions show up without a manual reload. Gated on a first load.
  useEffect(() => {
    const base = basePath.trim()
    if (!base) return
    const id = setInterval(async () => {
      if (!loadedOnce.current) return
      try {
        setProjects(await listProjects(base))
      } catch {
        /* ignore */
      }
      if (projectPath) {
        try {
          setSessions(await listSessions(projectPath))
        } catch {
          /* ignore */
        }
      }
    }, LIST_POLL_MS)
    return () => clearInterval(id)
  }, [basePath, projectPath])

  const activeSession = sessions.find((s) => s.path === sessionPath) ?? null

  return {
    providers,
    provider,
    providerId,
    basePath,
    setBasePath,
    selectProvider,
    projects,
    projectPath,
    loadProjects,
    refreshProjects,
    selectProject,
    sessions,
    sessionPath,
    activeSession,
    selectSession,
    refreshSessions,
    refreshActiveSession,
    deleteSession,
    renameSession,
    messages,
    loading,
    error,
  }
}
