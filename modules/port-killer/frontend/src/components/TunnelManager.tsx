import { useState } from 'react'
import { Button, Badge } from '@pk/components/ui'
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
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold">SSH Tunnels</h3>
                    <p className="text-xs text-muted-foreground">Forward local traffic through SSH</p>
                </div>
                <Button variant="outline" size="xs" onClick={onAdd}>
                    <Plus className="size-3" />
                    Add
                </Button>
            </div>

            {tunnels.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/30 px-3 py-8 text-center text-xs italic text-muted-foreground">
                    No tunnels configured. Click Add to create an SSH tunnel.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tunnels.map((t) => (
                        <div key={t.id} className="space-y-3 rounded-xl border border-border/30 bg-background/50 p-4">
                            <div className="flex items-center gap-2">
                                <span className={`size-2 shrink-0 rounded-full ${
                                    t.is_running
                                        ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]'
                                        : 'bg-red-400'
                                }`} />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={t.config.label}>
                                    {t.config.label}
                                </span>
                                <Badge
                                    variant="outline"
                                    className={
                                        t.is_running
                                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                                            : 'border-red-400/20 bg-red-400/10 text-red-400'
                                    }
                                >
                                    {t.is_running ? 'running' : 'stopped'}
                                </Badge>
                            </div>

                            <div className="truncate pk-mono text-xs leading-relaxed text-muted-foreground" title={`${t.config.local_port} → ${t.config.remote_host}:${t.config.remote_port} via ${t.config.ssh_user}@${t.config.ssh_host}`}>
                                <span className="text-cyan-400">{t.config.local_port}</span>
                                {' → '}
                                {t.config.remote_host}:<span className="text-emerald-400">{t.config.remote_port}</span>
                                {' via '}
                                {t.config.ssh_user}@{t.config.ssh_host}
                                {t.config.ssh_port !== 22 && `:${t.config.ssh_port}`}
                            </div>

                            {t.error && (
                                <div className="flex items-start gap-1.5 rounded-lg border border-red-400/20 bg-red-400/10 px-2.5 py-1.5 text-xs text-red-400">
                                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                    <span className="min-w-0">{t.error}</span>
                                </div>
                            )}

                            {t.command && (
                                <div>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                        onClick={() => setExpandedCmd(expandedCmd === t.id ? null : t.id)}
                                    >
                                        <Terminal className="size-3" />
                                        <span>Command</span>
                                        <ChevronDown className={`ml-auto size-3 transition-transform ${expandedCmd === t.id ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedCmd === t.id && (
                                        <div className="mt-1.5 select-all overflow-x-auto rounded-lg border bg-background/50 px-2.5 py-1.5 pk-mono text-[11px] text-muted-foreground">
                                            {t.command}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-1 border-t border-border/30 pt-3">
                                {t.is_running ? (
                                    <Button variant="ghost" size="icon-xs" onClick={() => onStop(t.id)} className="text-red-400 hover:bg-red-400/10" title="Stop">
                                        <Square className="size-3" />
                                    </Button>
                                ) : (
                                    <Button variant="ghost" size="icon-xs" onClick={() => onStart(t.id)} className="text-green-400 hover:bg-green-400/10" title="Start">
                                        <Play className="size-3" />
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon-xs" onClick={() => onEdit(t.id)} title="Edit">
                                    <Pencil className="size-3" />
                                </Button>
                                <Button variant="ghost" size="icon-xs" onClick={() => onDelete(t.id)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
                                    <Trash2 className="size-3" />
                                </Button>
                                {t.is_running && t.pid && (
                                    <span className="ml-auto pk-mono text-xs text-muted-foreground">PID {t.pid}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
