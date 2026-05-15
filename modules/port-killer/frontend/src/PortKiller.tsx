import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
    fetchPorts,
    killPorts,
    fetchTunnels,
    createTunnel,
    updateTunnel,
    deleteTunnel,
    startTunnel,
    stopTunnel,
} from './api/port-api'
import type {
    PortEntry,
    PortProfile,
    SavedPortConfig,
    KillResult,
    TunnelStatus,
    TunnelCreateRequest,
} from './types/port.types'
import { PortTable } from './components/PortTable'
import { PortActions } from './components/PortActions'
import { ProfileManager } from './components/ProfileManager'
import { KillConfirmDialog } from './components/KillConfirmDialog'
import { WarningDialog } from './components/WarningDialog'
import { TunnelManager } from './components/TunnelManager'
import { TunnelDialog } from './components/TunnelDialog'
import { checkProcessSafety, checkBulkKillSafety } from './utils/port-safety'
import { Activity, Cable, RadioTower, ShieldAlert, TerminalSquare } from 'lucide-react'

const STORAGE_KEY = 'port-killer-configs'
const PROFILES_KEY = 'port-killer-profiles'

function loadSavedConfigs(): SavedPortConfig[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
        return []
    }
}

function saveSavedConfigs(configs: SavedPortConfig[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

function loadProfiles(): PortProfile[] {
    try {
        return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')
    } catch {
        return []
    }
}

function saveProfiles(profiles: PortProfile[]) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export default function PortKiller() {
    const [activeTab, setActiveTab] = useState<'ports' | 'tunnels'>('ports')
    const [ports, setPorts] = useState<PortEntry[]>([])
    const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [isKilling, setIsKilling] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [showKillConfirm, setShowKillConfirm] = useState(false)
    const [killResults, setKillResults] = useState<KillResult[] | null>(null)
    const [savedConfigs, setSavedConfigs] = useState<SavedPortConfig[]>(loadSavedConfigs)
    const [profiles, setProfiles] = useState<PortProfile[]>(loadProfiles)
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

    // Warning dialog state
    const [warningDialog, setWarningDialog] = useState<{
        title: string
        message: string
        details?: React.ReactNode
        variant: 'warning' | 'danger'
        onConfirm?: () => void
        showConfirm: boolean
    } | null>(null)

    // Tunnel state
    const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
    const [showTunnelDialog, setShowTunnelDialog] = useState(false)
    const [editingTunnelId, setEditingTunnelId] = useState<string | null>(null)
    const editingTunnelIdRef = useRef<string | null>(null)

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const mergePorts = useCallback(
        (rawPorts: PortEntry[]): PortEntry[] => {
            return rawPorts.map((p) => {
                const saved = savedConfigs.find((c) => c.port === p.local_port)
                if (saved) {
                    return { ...p, label: saved.label, group: saved.group }
                }
                return p
            })
        },
        [savedConfigs],
    )

    const loadPorts = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await fetchPorts()
            setPorts(mergePorts(data))
        } catch {
            // silently fail on refresh
        } finally {
            setIsLoading(false)
        }
    }, [mergePorts])

    const loadTunnels = useCallback(async () => {
        try {
            const data = await fetchTunnels()
            setTunnels(data)
        } catch {
            // silently fail
        }
    }, [])

    // Initial load
    useEffect(() => {
        loadPorts()
        loadTunnels()
    }, [loadPorts, loadTunnels])

    // Auto-refresh
    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(() => {
                loadPorts()
                loadTunnels()
            }, 3000)
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [autoRefresh, loadPorts, loadTunnels])

    // --- Port config ---

    const updateConfig = useCallback(
        (port: number, field: keyof SavedPortConfig, value: string) => {
            setSavedConfigs((prev) => {
                const idx = prev.findIndex((c) => c.port === port)
                let updated: SavedPortConfig[]
                if (idx >= 0) {
                    updated = [...prev]
                    updated[idx] = { ...updated[idx], [field]: value || undefined }
                } else {
                    updated = [...prev, { port, [field]: value || undefined }]
                }
                updated = updated.filter((c) => c.label || c.group)
                saveSavedConfigs(updated)
                return updated
            })

            setPorts((prev) =>
                prev.map((p) =>
                    p.local_port === port ? { ...p, [field]: value || undefined } : p,
                ),
            )
        },
        [],
    )

    // --- Selection ---

    const handleToggleSelect = useCallback((pid: number) => {
        setSelectedPids((prev) => {
            const next = new Set(prev)
            if (next.has(pid)) next.delete(pid)
            else next.add(pid)
            return next
        })
    }, [])

    const handleToggleSelectAll = useCallback(() => {
        setSelectedPids((prev) => {
            const allPids = new Set(ports.map((p) => p.pid))
            const allSelected = allPids.size > 0 && [...allPids].every((pid) => prev.has(pid))
            return allSelected ? new Set() : allPids
        })
    }, [ports])

    // Build process name map (needed by kill safety checks)
    const processNames = useMemo(
        () => new Map(ports.map((p) => [p.pid, p.label || p.name])),
        [ports],
    )

    // --- Kill ---

    const doKill = useCallback(async (pids: number[], clearSelection = false) => {
        setIsKilling(true)
        try {
            const results = await killPorts(pids)
            setKillResults(results)
            if (clearSelection) {
                setSelectedPids(new Set())
                setShowKillConfirm(false)
            }
            setTimeout(() => {
                loadPorts()
                loadTunnels()
            }, 500)
        } catch {
            // ignore
        } finally {
            setIsKilling(false)
        }
    }, [loadPorts, loadTunnels])

    const handleKillConfirm = useCallback(() => {
        const pids = Array.from(selectedPids)
        const safetyResult = checkBulkKillSafety(pids, processNames)

        if (safetyResult.hasSystemProcesses) {
            setShowKillConfirm(false)
            if (safetyResult.safePids.length === 0) {
                // All selected are system processes — block entirely
                setWarningDialog({
                    title: 'Cannot Kill System Processes',
                    message: 'All selected processes are critical Windows system processes.',
                    variant: 'danger',
                    showConfirm: false,
                    details: (
                        <div className="space-y-1">
                            {safetyResult.blockedPids.map((b) => (
                                <div key={b.pid} className="flex items-baseline gap-2 break-words text-red-400">
                                    <span className="shrink-0 font-mono text-xs">PID {b.pid}</span>
                                    <span className="min-w-0 flex-1">— {b.name}</span>
                                </div>
                            ))}
                        </div>
                    ),
                })
            } else {
                // Some are system, some are safe — warn and offer to kill safe ones
                setWarningDialog({
                    title: 'System Processes Detected',
                    message: `${safetyResult.blockedPids.length} system process(es) will be skipped. Kill the remaining ${safetyResult.safePids.length}?`,
                    variant: 'warning',
                    showConfirm: true,
                    onConfirm: () => {
                        setWarningDialog(null)
                        doKill(safetyResult.safePids, true)
                    },
                    details: (
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-red-400">⛔ Blocked (system):</div>
                            {safetyResult.blockedPids.map((b) => (
                                <div key={b.pid} className="ml-2 flex items-baseline gap-2 break-words text-red-400/80">
                                    <span className="shrink-0 font-mono text-xs">PID {b.pid}</span>
                                    <span className="min-w-0 flex-1">— {b.name}</span>
                                </div>
                            ))}
                            <div className="mt-1 text-xs font-medium text-green-400">✓ Will kill:</div>
                            {safetyResult.safePids.map((pid) => (
                                <div key={pid} className="ml-2 flex items-baseline gap-2 break-words text-green-400/80">
                                    <span className="shrink-0 font-mono text-xs">PID {pid}</span>
                                    <span className="min-w-0 flex-1">— {processNames.get(pid) || 'Unknown'}</span>
                                </div>
                            ))}
                        </div>
                    ),
                })
            }
            return
        }

        doKill(pids, true)
    }, [selectedPids, processNames, doKill])

    const handleKillSingle = useCallback(
        (pid: number) => {
            const name = processNames.get(pid) || 'Unknown'
            const safety = checkProcessSafety(pid, name)

            if (safety.isSystemCritical) {
                setWarningDialog({
                    title: 'System Process — Cannot Kill',
                    message: safety.reason || `${name} is a critical system process.`,
                    variant: 'danger',
                    showConfirm: false,
                })
                return
            }

            // Show confirmation for non-system processes
            setWarningDialog({
                title: `Kill "${name}"?`,
                message: `This will terminate PID ${pid}. The action cannot be undone.`,
                variant: 'warning',
                showConfirm: true,
                onConfirm: () => {
                    setWarningDialog(null)
                    doKill([pid])
                },
            })
        },
        [processNames, doKill],
    )

    // --- Profiles ---

    const handleSaveProfile = useCallback(
        (name: string) => {
            const newProfile: PortProfile = {
                id: Date.now().toString(36),
                name,
                entries: [...savedConfigs],
            }
            setProfiles((prev) => {
                const updated = [...prev, newProfile]
                saveProfiles(updated)
                return updated
            })
            setActiveProfileId(newProfile.id)
        },
        [savedConfigs],
    )

    const handleLoadProfile = useCallback((profile: PortProfile) => {
        setSavedConfigs(profile.entries)
        saveSavedConfigs(profile.entries)
        setActiveProfileId(profile.id)
    }, [])

    const handleDeleteProfile = useCallback((id: string) => {
        setProfiles((prev) => {
            const updated = prev.filter((p) => p.id !== id)
            saveProfiles(updated)
            return updated
        })
        setActiveProfileId((prev) => (prev === id ? null : prev))
    }, [])

    // --- Tunnels ---

    const handleSaveTunnel = useCallback(
        async (data: TunnelCreateRequest): Promise<TunnelStatus> => {
            const id = editingTunnelIdRef.current
            let result: TunnelStatus
            if (id) {
                result = await updateTunnel(id, data)
            } else {
                result = await createTunnel(data)
            }
            loadTunnels()
            return result
        },
        [loadTunnels],
    )

    const handleCloseTunnelDialog = useCallback(() => {
        setShowTunnelDialog(false)
        setEditingTunnelId(null)
        editingTunnelIdRef.current = null
    }, [])

    const handleDeleteTunnel = useCallback(
        async (id: string) => {
            try {
                await deleteTunnel(id)
                loadTunnels()
            } catch {
                // ignore
            }
        },
        [loadTunnels],
    )

    const handleStartTunnel = useCallback(
        async (id: string) => {
            try {
                await startTunnel(id)
                loadTunnels()
            } catch {
                // ignore
            }
        },
        [loadTunnels],
    )

    const handleStopTunnel = useCallback(
        async (id: string) => {
            try {
                await stopTunnel(id)
                loadTunnels()
            } catch {
                // ignore
            }
        },
        [loadTunnels],
    )

    const editingTunnel = editingTunnelId
        ? tunnels.find((t) => t.id === editingTunnelId)?.config ?? null
        : null

    const listeningCount = ports.filter((p) => p.status === 'LISTEN').length
    const runningTunnelCount = tunnels.filter((t) => t.is_running).length
    const labeledCount = ports.filter((p) => p.label || p.group).length



    return (
        <div className="pk-shell">
        <div className="pk-page space-y-3">
            <header className="pk-panel rounded-xl p-4">
                <div className="pk-hero-layout">
                    <div className="min-w-0">
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/10 px-2.5 py-1 pk-mono text-[10px] font-bold uppercase tracking-wider text-cyan-100">
                            <ShieldAlert className="size-3.5" />
                            Local process control
                        </div>
                        <h1 className="text-xl font-semibold tracking-tight text-[#edf3f7]">Port Killer</h1>
                        <p className="mt-1 max-w-lg text-xs leading-5 pk-subtle">
                            Inspect listening ports, label services, terminate stuck processes, and manage SSH tunnels.
                        </p>
                    </div>

                    <div className="pk-metrics">
                        <MetricCard label="Ports" value={ports.length} icon={<Cable className="size-3.5" />} tone="cyan" />
                        <MetricCard label="Listening" value={listeningCount} icon={<Activity className="size-3.5" />} tone="emerald" />
                        <MetricCard label="Tagged" value={labeledCount} icon={<TerminalSquare className="size-3.5" />} tone="violet" />
                        <MetricCard label="Tunnels" value={`${runningTunnelCount}/${tunnels.length}`} icon={<RadioTower className="size-3.5" />} tone="magenta" />
                    </div>
                </div>
            </header>
            {/* Tab bar */}
            <div className="pk-panel inline-flex items-center gap-1 rounded-xl p-1">
                <button
                    onClick={() => setActiveTab('ports')}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        activeTab === 'ports'
                            ? 'border border-cyan-200/20 bg-cyan-200/10 text-cyan-100 shadow-sm'
                            : 'pk-subtle hover:bg-white/[0.045] hover:text-[#edf3f7]'
                    }`}
                >
                    <Cable className="size-4" />
                    Ports
                    {ports.length > 0 && (
                        <span className="rounded-full bg-black/25 px-2 py-0.5 pk-mono text-xs">
                            {ports.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('tunnels')}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        activeTab === 'tunnels'
                            ? 'border border-fuchsia-200/20 bg-fuchsia-200/10 text-fuchsia-100 shadow-sm'
                            : 'pk-subtle hover:bg-white/[0.045] hover:text-[#edf3f7]'
                    }`}
                >
                    <RadioTower className="size-4" />
                    SSH Tunnels
                    {tunnels.length > 0 && (
                        <span className="rounded-full bg-black/25 px-2 py-0.5 pk-mono text-xs">
                            {runningTunnelCount}/{tunnels.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Kill results banner (shared) */}
            {killResults && (
                <div className="pk-panel space-y-1 rounded-xl p-3 text-sm">
                    {killResults.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <span className={`shrink-0 font-mono text-xs ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                                {r.success ? 'OK' : 'FAIL'}
                            </span>
                            {r.pid > 0 && <span className="shrink-0 font-mono text-xs">PID {r.pid}</span>}
                            {r.error && <span className="min-w-0 flex-1 break-words pk-subtle">— {r.error}</span>}
                        </div>
                    ))}
                    <button
                        onClick={() => setKillResults(null)}
                        className="mt-1 text-xs pk-subtle hover:text-[#edf3f7]"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* === Ports Tab === */}
            {activeTab === 'ports' && (
                <>
                    <PortActions
                        selectedCount={selectedPids.size}
                        onKill={() => setShowKillConfirm(true)}
                        onRefresh={() => {
                            loadPorts()
                            loadTunnels()
                        }}
                        isRefreshing={isLoading}
                        isKilling={isKilling}
                        autoRefresh={autoRefresh}
                        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
                    />

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_240px]">
                        <PortTable
                            ports={ports}
                            selectedPids={selectedPids}
                            onToggleSelect={handleToggleSelect}
                            onToggleSelectAll={handleToggleSelectAll}
                            onKillSingle={handleKillSingle}
                            onUpdateLabel={(port, label) => updateConfig(port, 'label', label)}
                            onUpdateGroup={(port, group) => updateConfig(port, 'group', group)}
                            isLoading={isLoading}
                        />

                        <ProfileManager
                            profiles={profiles}
                            activeProfileId={activeProfileId}
                            onLoad={handleLoadProfile}
                            onSave={handleSaveProfile}
                            onDelete={handleDeleteProfile}
                        />
                    </div>
                </>
            )}

            {/* === SSH Tunnels Tab === */}
            {activeTab === 'tunnels' && (
                <TunnelManager
                    tunnels={tunnels}
                    onAdd={() => {
                        editingTunnelIdRef.current = null
                        setEditingTunnelId(null)
                        setShowTunnelDialog(true)
                    }}
                    onEdit={(id) => {
                        editingTunnelIdRef.current = id
                        setEditingTunnelId(id)
                        setShowTunnelDialog(true)
                    }}
                    onDelete={handleDeleteTunnel}
                    onStart={handleStartTunnel}
                    onStop={handleStopTunnel}
                />
            )}

            {/* Kill confirmation dialog */}
            {showKillConfirm && (
                <KillConfirmDialog
                    pids={Array.from(selectedPids)}
                    processNames={processNames}
                    onConfirm={handleKillConfirm}
                    onCancel={() => setShowKillConfirm(false)}
                    isKilling={isKilling}
                />
            )}

            {/* Tunnel config dialog */}
            {showTunnelDialog && (
                <TunnelDialog
                    tunnel={editingTunnel}
                    onSave={handleSaveTunnel}
                    onClose={handleCloseTunnelDialog}
                />
            )}

            {/* Warning/Block dialog */}
            {warningDialog && (
                <WarningDialog
                    title={warningDialog.title}
                    message={warningDialog.message}
                    details={warningDialog.details}
                    variant={warningDialog.variant}
                    showConfirm={warningDialog.showConfirm}
                    onConfirm={warningDialog.onConfirm}
                    onCancel={() => setWarningDialog(null)}
                />
            )}
        </div>
        </div>
    )
}

function MetricCard({
    label,
    value,
    icon,
    tone,
}: {
    label: string
    value: number | string
    icon: React.ReactNode
    tone: 'cyan' | 'emerald' | 'violet' | 'magenta'
}) {
    const tones = {
        cyan: 'border-cyan-200/15 bg-cyan-200/10 text-cyan-100',
        emerald: 'border-emerald-200/15 bg-emerald-200/10 text-emerald-100',
        violet: 'border-violet-200/15 bg-violet-200/10 text-violet-100',
        magenta: 'border-fuchsia-200/15 bg-fuchsia-200/10 text-fuchsia-100',
    }

    return (
        <div className="pk-metric-card">
            <div className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${tones[tone]}`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate pk-mono text-base font-bold leading-none text-[#edf3f7]" title={String(value)}>{value}</div>
                <div className="mt-1 truncate pk-mono text-[9px] font-bold uppercase tracking-wider pk-muted">{label}</div>
            </div>
        </div>
    )
}
