import { useCallback, useEffect, useState } from 'react'
import {
  listProviders,
  listProjects,
  listSessions,
  readSession,
} from '../api/ai-session-viewer-api'
import type { ProviderInfo, ProjectEntry, SessionEntry, ChatMessage } from '../types'

function errMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
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

  const loadProjects = useCallback(async () => {
    if (!basePath.trim()) {
      setError('Enter a sessions folder path first.')
      return
    }
    setError(null)
    setLoading((s) => ({ ...s, projects: true }))
    setProjects([])
    setProjectPath(null)
    setSessions([])
    setSessionPath(null)
    setMessages([])
    try {
      setProjects(await listProjects(basePath.trim()))
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setLoading((s) => ({ ...s, projects: false }))
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
    selectProject,
    sessions,
    sessionPath,
    activeSession,
    selectSession,
    messages,
    loading,
    error,
  }
}
