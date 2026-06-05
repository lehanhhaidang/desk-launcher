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
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@pk/components/ui'
import { Activity, Cable, RadioTower, TerminalSquare } from 'lucide-react'

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

    const [warningDialog, setWarningDialog] = useState<{
        title: string
        message: string
        details?: React.ReactNode
        variant: 'warning' | 'danger'
        onConfirm?: () => void
        showConfirm: boolean
    } | null>(null)

    const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
    const [showTunnelDialog, setShowTunnelDialog] = useState(false)
    const [editingTunnelId, setEditingTunnelId] = useState<string | null>(null)
    const editingTunnelIdRef = useRef<string | null>(null)

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        document.documentElement.classList.add('dark')
    }, [])

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

    useEffect(() => {
        loadPorts()
        loadTunnels()
    }, [loadPorts, loadTunnels])

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

    const processNames = useMemo(
        () => new Map(ports.map((p) => [p.pid, p.label || p.name])),
        [ports],
    )

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
                setWarningDialog({
                    title: 'Cannot Kill System Processes',
                    message: 'All selected processes are critical Windows system processes.',
                    variant: 'danger',
                    showConfirm: false,
                    details: (
                        <div className="space-y-1">
                            {safetyResult.blockedPids.map((b) => (
                                <div key={b.pid} className="flex items-baseline gap-2 overflow-hidden text-ellipsis text-red-400">
                                    <span className="shrink-0 pk-mono text-xs">PID {b.pid}</span>
                                    <span className="min-w-0 flex-1">— {b.name}</span>
                                </div>
                            ))}
                        </div>
                    ),
                })
            } else {
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
                            <div className="text-xs font-medium text-red-400">Blocked (system):</div>
                            {safetyResult.blockedPids.map((b) => (
                                <div key={b.pid} className="ml-2 flex items-baseline gap-2 overflow-hidden text-ellipsis text-red-400/80">
                                    <span className="shrink-0 pk-mono text-xs">PID {b.pid}</span>
                                    <span className="min-w-0 flex-1">— {b.name}</span>
                                </div>
                            ))}
                            <div className="mt-1 text-xs font-medium text-green-400">Will kill:</div>
                            {safetyResult.safePids.map((pid) => (
                                <div key={pid} className="ml-2 flex items-baseline gap-2 overflow-hidden text-ellipsis text-green-400/80">
                                    <span className="shrink-0 pk-mono text-xs">PID {pid}</span>
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
        <div className="pk-shell bg-background text-foreground">
        <div className="pk-page mx-auto space-y-6 px-4 py-6 lg:px-8">
            <div className="pk-hero">
                <div>
                    <p className="pk-section-label">Network process control</p>
                    <h1 className="text-2xl font-bold">Port Killer</h1>
                </div>
                <p className="max-w-3xl text-sm text-muted-foreground">
                    Inspect listening ports, label services, terminate stuck processes, and manage SSH tunnels.
                </p>
            </div>

            <div className="pk-metric-row">
                <MetricCard label="Ports" value={ports.length} icon={<Cable className="size-5" />} tone="cyan" />
                <MetricCard label="Listening" value={listeningCount} icon={<Activity className="size-5" />} tone="emerald" />
                <MetricCard label="Tagged" value={labeledCount} icon={<TerminalSquare className="size-5" />} tone="violet" />
                <MetricCard label="Tunnels" value={`${runningTunnelCount}/${tunnels.length}`} icon={<RadioTower className="size-5" />} tone="magenta" />
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ports' | 'tunnels')}>
                <TabsList>
                    <TabsTrigger value="ports">
                        <Cable className="size-4" />
                        Ports
                        {ports.length > 0 && (
                            <Badge variant="secondary" className="ml-1 px-1.5 py-0 pk-mono text-[11px]">
                                {ports.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="tunnels">
                        <RadioTower className="size-4" />
                        SSH Tunnels
                        {tunnels.length > 0 && (
                            <Badge variant="secondary" className="ml-1 px-1.5 py-0 pk-mono text-[11px]">
                                {runningTunnelCount}/{tunnels.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {killResults && (
                    <div className="mt-4 space-y-1 rounded-xl border border-border/40 bg-card/40 p-4 text-sm">
                        {killResults.map((r, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className={`shrink-0 pk-mono text-xs ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                                    {r.success ? 'OK' : 'FAIL'}
                                </span>
                                {r.pid > 0 && <span className="shrink-0 pk-mono text-xs text-foreground">PID {r.pid}</span>}
                                {r.error && <span className="min-w-0 flex-1 text-muted-foreground">— {r.error}</span>}
                            </div>
                        ))}
                        <button
                            onClick={() => setKillResults(null)}
                            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <TabsContent value="ports" className="mt-4 space-y-4 data-[state=inactive]:hidden" forceMount>
                    <div className="pk-utility-row">
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
                        <ProfileManager
                            profiles={profiles}
                            activeProfileId={activeProfileId}
                            onLoad={handleLoadProfile}
                            onSave={handleSaveProfile}
                            onDelete={handleDeleteProfile}
                        />
                    </div>

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
                </TabsContent>

                <TabsContent value="tunnels" className="mt-4 data-[state=inactive]:hidden" forceMount>
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
                </TabsContent>
            </Tabs>

            {showKillConfirm && (
                <KillConfirmDialog
                    pids={Array.from(selectedPids)}
                    processNames={processNames}
                    onConfirm={handleKillConfirm}
                    onCancel={() => setShowKillConfirm(false)}
                    isKilling={isKilling}
                />
            )}

            {showTunnelDialog && (
                <TunnelDialog
                    tunnel={editingTunnel}
                    onSave={handleSaveTunnel}
                    onClose={handleCloseTunnelDialog}
                />
            )}

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
    const toneColors = {
        cyan: 'text-cyan-400',
        emerald: 'text-emerald-400',
        violet: 'text-violet-400',
        magenta: 'text-fuchsia-400',
    }

    return (
        <div className="pk-metric-card rounded-2xl border border-border/40 bg-card/40 p-5">
            <div className={`mb-3 ${toneColors[tone]}`}>{icon}</div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    )
}
