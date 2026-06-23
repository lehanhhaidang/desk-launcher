import { invoke } from '@tauri-apps/api/core'
import type { ProviderInfo, ProjectEntry, SessionEntry, ChatMessage } from '../types'

const ns = (cmd: string) => `plugin:ai-session-viewer|${cmd}`

export const listProviders = () => invoke<ProviderInfo[]>(ns('list_providers'))

export const listProjects = (basePath: string) =>
  invoke<ProjectEntry[]>(ns('list_projects'), { basePath })

export const listSessions = (projectPath: string) =>
  invoke<SessionEntry[]>(ns('list_sessions'), { projectPath })

export const readSession = (sessionPath: string) =>
  invoke<ChatMessage[]>(ns('read_session'), { sessionPath })

export const deleteSession = (sessionPath: string) =>
  invoke<void>(ns('delete_session'), { sessionPath })

/** Renames the session file on disk; returns the new absolute path. */
export const renameSession = (sessionPath: string, newName: string) =>
  invoke<string>(ns('rename_session'), { sessionPath, newName })
