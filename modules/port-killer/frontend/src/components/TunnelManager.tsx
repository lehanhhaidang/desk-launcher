import { useState } from 'react'
import { Button } from '@desk-launcher/ui'
import { Plus, Play, Square, Pencil, Trash2, AlertCircle, Terminal, ChevronDown } from 'lucide-react'
import type { TunnelStatus } from '../types/port.types'

interface TunnelManagerProps {
    tunnels: TunnelStatus[]
    onAdd: () => void
    onEdit: (id: string) => void
    onDelete: (id: string) => void
    onStart: (id: string) => void
    onStop: (id: string) => void
}

export function TunnelManager({
    tunnels,
    onAdd,
    onEdit,
    onDelete,
    onStart,
    onStop,
}: TunnelManagerProps) {
    const [expandedCmd, setExpandedCmd] = useState<string | null>(null)

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">SSH Tunnels</h3>
                <Button variant="ghost" size="xs" onClick={onAdd}>
                    <Plus className="size-3" />
                    Add
                </Button>
            </div>

            {tunnels.length === 0 ? (
                <p className="text-xs italic text-muted-foreground/60">
                    No tunnels configured. Click Add to create an SSH tunnel.
                </p>
            ) : (
                <div className="space-y-2">
                    {tunnels.map((t) => (
                        <div
                            key={t.id}
                            className="rounded-lg border border-border/30 bg-muted/10 p-3"
                        >
                            {/* Header: label + status */}
                            <div className="mb-1.5 flex items-center gap-2">
                                <span
                                    className={`inline-block size-2 rounded-full ${
                                        t.is_running ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                                />
                                <span className="flex-1 truncate text-sm font-medium">
                                    {t.config.label}
                                </span>
                            </div>

                            {/* Connection info */}
                            <div className="mb-2 font-mono text-xs text-muted-foreground">
                                <span className="text-orange-400">{t.config.local_port}</span>
                                {' → '}
                                {t.config.remote_host}:<span className="text-green-400">{t.config.remote_port}</span>
                                {' via '}
                                {t.config.ssh_user}@{t.config.ssh_host}
                                {t.config.ssh_port !== 22 && `:${t.config.ssh_port}`}
                            </div>

                            {/* Error */}
                            {t.error && (
                                <div className="mb-2 flex items-start gap-1.5 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">
                                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                    <span className="break-all">{t.error}</span>
                                </div>
                            )}

                            {/* Command preview (expandable) */}
                            {t.command && (
                                <div className="mb-2">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                        onClick={() => setExpandedCmd(expandedCmd === t.id ? null : t.id)}
                                    >
                                        <Terminal className="size-3" />
                                        <span>Command</span>
                                        <ChevronDown className={`size-3 ml-auto transition-transform ${expandedCmd === t.id ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedCmd === t.id && (
                                        <div className="mt-1 rounded bg-muted/30 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground break-all select-all">
                                            {t.command}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                {t.is_running ? (
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => onStop(t.id)}
                                        className="text-red-400 hover:text-red-300"
                                        title="Stop"
                                    >
                                        <Square className="size-3" />
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => onStart(t.id)}
                                        className="text-green-400 hover:text-green-300"
                                        title="Start"
                                    >
                                        <Play className="size-3" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => onEdit(t.id)}
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Edit"
                                >
                                    <Pencil className="size-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => onDelete(t.id)}
                                    className="text-muted-foreground hover:text-red-400"
                                    title="Delete"
                                >
                                    <Trash2 className="size-3" />
                                </Button>
                                {t.is_running && t.pid && (
                                    <span className="ml-auto text-xs text-muted-foreground/50">
                                        PID {t.pid}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
