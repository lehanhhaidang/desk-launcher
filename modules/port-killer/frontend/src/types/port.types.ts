export interface PortEntry {
    pid: number
    name: string
    local_address: string
    local_port: number
    remote_address: string
    status: string
    family: string
    // Client-side fields (saved in localStorage)
    label?: string
    group?: string
}

export interface KillResult {
    pid: number
    success: boolean
    error?: string
}

export interface SavedPortConfig {
    port: number
    label?: string
    group?: string
}

export interface PortProfile {
    id: string
    name: string
    entries: SavedPortConfig[]
}

// --- Tunnel types ---

export interface TunnelConfig {
    id: string
    label: string
    ssh_user: string
    ssh_host: string
    ssh_port: number
    remote_host: string
    remote_port: number
    local_port: number
    identity_file?: string
    password?: string
    extra_args?: string
    enabled: boolean
}

export interface TunnelStatus {
    id: string
    config: TunnelConfig
    is_running: boolean
    pid?: number
    error?: string
    command?: string
}

export interface TunnelCreateRequest {
    label: string
    ssh_user: string
    ssh_host: string
    ssh_port: number
    remote_host: string
    remote_port: number
    local_port: number
    identity_file?: string
    password?: string
    extra_args?: string
}
