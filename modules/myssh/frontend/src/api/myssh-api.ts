import { invoke } from '@tauri-apps/api/core'

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

export const listHosts = () => invoke<Host[]>(ns('list_hosts'))
export const createHost = (input: HostInput) => invoke<Host>(ns('create_host'), { input })
export const updateHost = (id: string, input: HostInput) =>
  invoke<Host>(ns('update_host'), { id, input })
export const deleteHost = (id: string) => invoke<void>(ns('delete_host'), { id })

export const listGroups = () => invoke<Group[]>(ns('list_groups'))
export const createGroup = (name: string) => invoke<Group>(ns('create_group'), { input: { name } })
export const deleteGroup = (id: string) => invoke<void>(ns('delete_group'), { id })
