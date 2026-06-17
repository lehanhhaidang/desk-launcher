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
  jumpHostId: string | null
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
  jumpHostId: string | null
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

export interface Forward {
  id: string
  hostId: string
  kind: string
  bindAddr: string
  bindPort: number
  destHost: string
  destPort: number
  label: string
  autoStart: boolean
  createdAt: number
}

export interface ForwardInput {
  hostId: string
  kind: string
  bindAddr: string
  bindPort: number
  destHost: string
  destPort: number
  label: string
  autoStart: boolean
}

export interface KnownHost {
  host: string
  port: number
  keyType: string
  fingerprint: string
}

export interface ForwardStatus {
  forward: Forward
  running: boolean
}

export interface SftpEntry {
  name: string
  path: string
  isDir: boolean
  isSymlink: boolean
  size: number
  modified: number | null
}

export interface SftpOpened {
  sftpId: string
  home: string
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

// --- Port forwards ---

export const listForwards = () => invoke<ForwardStatus[]>(ns('list_forwards'))
export const createForward = (input: ForwardInput) => invoke<Forward>(ns('create_forward'), { input })
export const deleteForward = (id: string) => invoke<void>(ns('delete_forward'), { id })
export const startForward = (id: string) => invoke<void>(ns('start_forward'), { id })
export const stopForward = (id: string) => invoke<void>(ns('stop_forward'), { id })

// --- Known hosts ---

export const listKnownHosts = () => invoke<KnownHost[]>(ns('list_known_hosts'))
export const removeKnownHost = (host: string, port: number) =>
  invoke<void>(ns('remove_known_host'), { host, port })

export interface HostKeyPrompt {
  requestId: string
  host: string
  port: number
  keyType: string
  fingerprint: string
  changed: boolean
}

export const respondHostKey = (requestId: string, accept: boolean) =>
  invoke<void>(ns('respond_host_key'), { requestId, accept })

/** Subscribe to interactive host-key accept/reject prompts. */
export const onHostKeyPrompt = (cb: (prompt: HostKeyPrompt) => void): Promise<UnlistenFn> =>
  listen<HostKeyPrompt>('myssh://hostkey-prompt', (e) => cb(e.payload))

// --- SFTP ---

export const sftpOpen = (hostId: string) => invoke<SftpOpened>(ns('sftp_open'), { hostId })
export const sftpList = (sftpId: string, path: string) =>
  invoke<SftpEntry[]>(ns('sftp_list'), { sftpId, path })
export const sftpDownload = (sftpId: string, remotePath: string, localPath: string) =>
  invoke<void>(ns('sftp_download'), { sftpId, remotePath, localPath })
export const sftpUpload = (sftpId: string, localPath: string, remotePath: string) =>
  invoke<void>(ns('sftp_upload'), { sftpId, localPath, remotePath })
export const sftpMkdir = (sftpId: string, path: string) =>
  invoke<void>(ns('sftp_mkdir'), { sftpId, path })
export const sftpRemove = (sftpId: string, path: string, isDir: boolean) =>
  invoke<void>(ns('sftp_remove'), { sftpId, path, isDir })
export const sftpRename = (sftpId: string, from: string, to: string) =>
  invoke<void>(ns('sftp_rename'), { sftpId, from, to })
export const sftpClose = (sftpId: string) => invoke<void>(ns('sftp_close'), { sftpId })
export const sftpUploadDir = (sftpId: string, localDir: string, remoteDir: string) =>
  invoke<void>(ns('sftp_upload_dir'), { sftpId, localDir, remoteDir })
export const sftpDownloadDir = (sftpId: string, remoteDir: string, localDir: string) =>
  invoke<void>(ns('sftp_download_dir'), { sftpId, remoteDir, localDir })
export const sftpReadText = (sftpId: string, path: string) =>
  invoke<FilePreview>(ns('sftp_read_text'), { sftpId, path })

export interface FilePreview {
  content: string | null
  isBinary: boolean
  tooLarge: boolean
  size: number
}

// --- Local filesystem (for the dual-pane file manager) ---

export const localHome = () => invoke<string>(ns('local_home'))
export const localRoots = () => invoke<string[]>(ns('local_roots'))
export const localList = (path: string) => invoke<SftpEntry[]>(ns('local_list'), { path })
export const localReadText = (path: string) => invoke<FilePreview>(ns('local_read_text'), { path })
export const localRemove = (path: string, isDir: boolean) =>
  invoke<void>(ns('local_remove'), { path, isDir })
export const localMkdir = (path: string) => invoke<void>(ns('local_mkdir'), { path })
export const localRename = (from: string, to: string) =>
  invoke<void>(ns('local_rename'), { from, to })

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
