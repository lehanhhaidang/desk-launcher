import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const ns = (cmd: string) => `plugin:myssh|${cmd}`

export type AuthMethod = 'password' | 'key' | 'agent'

export interface Host {
  id: string
  label: string
  hostname: string
  port: number
  username: string
  groupId: string | null
  authMethod: AuthMethod
  keyPath: string | null
  hasSecret: boolean
  tags: string[]
  lastUsed: number | null
  createdAt: number
  updatedAt: number
}

export interface HostInput {
  label: string
  hostname: string
  port: number
  username: string
  groupId: string | null
  authMethod: AuthMethod
  keyPath: string | null
  /** Plaintext password/passphrase. `null` leaves a saved secret unchanged. */
  secret: string | null
  tags: string[]
}

export interface Group {
  id: string
  name: string
  createdAt: number
}

export interface Snippet {
  id: string
  name: string
  command: string
  createdAt: number
}

export interface SnippetInput {
  name: string
  command: string
}

export const listHosts = () => invoke<Host[]>(ns('list_hosts'))
export const createHost = (input: HostInput) => invoke<Host>(ns('create_host'), { input })
export const updateHost = (id: string, input: HostInput) =>
  invoke<Host>(ns('update_host'), { id, input })
export const deleteHost = (id: string) => invoke<void>(ns('delete_host'), { id })

export const listGroups = () => invoke<Group[]>(ns('list_groups'))
export const createGroup = (name: string) => invoke<Group>(ns('create_group'), { input: { name } })
export const deleteGroup = (id: string) => invoke<void>(ns('delete_group'), { id })

// --- Snippets ---

export const listSnippets = () => invoke<Snippet[]>(ns('list_snippets'))
export const createSnippet = (input: SnippetInput) => invoke<Snippet>(ns('create_snippet'), { input })
export const updateSnippet = (id: string, input: SnippetInput) =>
  invoke<Snippet>(ns('update_snippet'), { id, input })
export const deleteSnippet = (id: string) => invoke<void>(ns('delete_snippet'), { id })

// --- Sessions ---

export const openSession = (hostId: string, cols: number, rows: number) =>
  invoke<string>(ns('open_session'), { hostId, cols, rows })
export const sendInput = (sessionId: string, data: number[]) =>
  invoke<void>(ns('send_input'), { sessionId, data })
export const resizeSession = (sessionId: string, cols: number, rows: number) =>
  invoke<void>(ns('resize_session'), { sessionId, cols, rows })
export const closeSession = (sessionId: string) =>
  invoke<void>(ns('close_session'), { sessionId })

/** Subscribe to a session's output bytes. */
export const onSessionData = (
  sessionId: string,
  cb: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> =>
  listen<number[]>(`myssh://data/${sessionId}`, (e) => cb(new Uint8Array(e.payload)))

/** Subscribe to a session's end (channel closed / EOF). */
export const onSessionExit = (sessionId: string, cb: () => void): Promise<UnlistenFn> =>
  listen(`myssh://exit/${sessionId}`, () => cb())
