import { invoke } from '@tauri-apps/api/core'
import type { PortEntry, KillResult, TunnelStatus, TunnelCreateRequest } from '../types/port.types'

// All commands live under the `port-killer` Tauri plugin. AbortSignal is
// not propagated to Rust commands (Tauri doesn't support cancellation
// natively) — the param is kept for API compatibility with the original
// fetch-based client but ignored.

const ns = (cmd: string) => `plugin:port-killer|${cmd}`

export function fetchPorts(_signal?: AbortSignal) {
    return invoke<PortEntry[]>(ns('list_ports'))
}

export function killPorts(pids: number[], _signal?: AbortSignal) {
    return invoke<KillResult[]>(ns('kill_ports'), { request: { pids } })
}

// --- Tunnel API (Rust plugin currently stubs these; UI shows empty list) ---

export function fetchTunnels(_signal?: AbortSignal) {
    return invoke<TunnelStatus[]>(ns('list_tunnels'))
}

export function createTunnel(data: TunnelCreateRequest) {
    return invoke<TunnelStatus>(ns('create_tunnel'), { config: data })
}

export function updateTunnel(id: string, data: Partial<TunnelCreateRequest>) {
    return invoke<TunnelStatus>(ns('update_tunnel'), { id, config: data })
}

export function deleteTunnel(id: string) {
    return invoke<{ status: string }>(ns('delete_tunnel'), { id })
}

export function startTunnel(id: string) {
    return invoke<TunnelStatus>(ns('start_tunnel'), { id })
}

export function stopTunnel(id: string) {
    return invoke<TunnelStatus>(ns('stop_tunnel'), { id })
}

export function fetchSshKeys() {
    return invoke<{ name: string; path: string }[]>(ns('list_ssh_keys'))
}
