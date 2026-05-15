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
        <div className="pk-panel rounded-xl p-4">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#edf3f7]">SSH Tunnels</h3>
                    <p className="pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Forward local traffic through SSH</p>
                </div>
                <Button variant="outline" size="xs" onClick={onAdd} className="border-white/10 bg-white/[0.035] text-[#edf3f7] hover:bg-white/[0.07]">
                    <Plus className="size-3" />
                    Add
                </Button>
            </div>

            {tunnels.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs italic pk-muted">
                    No tunnels configured. Click Add to create an SSH tunnel.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tunnels.map((t) => (
                        <div
                            key={t.id}
                            className="pk-card min-w-0 overflow-hidden rounded-xl p-3"
                        >
                            {/* Header: label + status */}
                            <div className="mb-1.5 flex items-center gap-2">
                                <span
                                    className={`inline-block size-2 shrink-0 rounded-full ${
                                        t.is_running ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#edf3f7]" title={t.config.label}>
                                    {t.config.label}
                                </span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 pk-mono text-[10px] font-bold uppercase ${
                                    t.is_running ? 'bg-emerald-200/10 text-emerald-200' : 'bg-red-200/10 text-red-200'
                                }`}>
                                    {t.is_running ? 'running' : 'stopped'}
                                </span>
                            </div>

                            {/* Connection info */}
                            <div className="mb-2 break-all pk-mono text-xs leading-relaxed pk-subtle">
                                <span className="text-cyan-200">{t.config.local_port}</span>
                                {' → '}
                                {t.config.remote_host}:<span className="text-emerald-200">{t.config.remote_port}</span>
                                {' via '}
                                {t.config.ssh_user}@{t.config.ssh_host}
                                {t.config.ssh_port !== 22 && `:${t.config.ssh_port}`}
                            </div>

                            {/* Error */}
                            {t.error && (
                                <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-200/15 bg-red-200/10 px-2 py-1 text-xs text-red-200">
                                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                    <span className="break-all">{t.error}</span>
                                </div>
                            )}

                            {/* Command preview (expandable) */}
                            {t.command && (
                                <div className="mb-2">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-1.5 text-xs pk-muted transition-colors hover:text-[#edf3f7]"
                                        onClick={() => setExpandedCmd(expandedCmd === t.id ? null : t.id)}
                                    >
                                        <Terminal className="size-3" />
                                        <span>Command</span>
                                        <ChevronDown className={`size-3 ml-auto transition-transform ${expandedCmd === t.id ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedCmd === t.id && (
                                        <div className="mt-1 select-all break-all rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 pk-mono text-[11px] pk-subtle">
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
                                    className="pk-muted hover:bg-white/[0.055] hover:text-[#edf3f7]"
                                    title="Edit"
                                >
                                    <Pencil className="size-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => onDelete(t.id)}
                                    className="pk-muted hover:bg-red-400/10 hover:text-red-200"
                                    title="Delete"
                                >
                                    <Trash2 className="size-3" />
                                </Button>
                                {t.is_running && t.pid && (
                                    <span className="ml-auto pk-mono text-xs pk-muted">
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
