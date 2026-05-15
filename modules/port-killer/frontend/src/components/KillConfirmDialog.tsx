import { Button } from '@desk-launcher/ui'
import { Skull, X } from 'lucide-react'

interface KillConfirmDialogProps {
    pids: number[]
    processNames: Map<number, string>
    onConfirm: () => void
    onCancel: () => void
    isKilling: boolean
}

export function KillConfirmDialog({
    pids,
    processNames,
    onConfirm,
    onCancel,
    isKilling,
}: KillConfirmDialogProps) {
    return (
        <div className="pk-dialog-backdrop">
            <div className="pk-dialog max-w-sm animate-in fade-in zoom-in-95 duration-200">
                <div className="pk-panel rounded-xl p-5 shadow-2xl">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                            <Skull className="size-5 text-red-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold">Kill {pids.length} process{pids.length > 1 ? 'es' : ''}?</h3>
                            <p className="text-sm pk-subtle">This action cannot be undone.</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="shrink-0 pk-muted hover:text-[#edf3f7]"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="mb-5 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-blue-200/10 bg-black/20 p-3">
                        {pids.map((pid) => (
                            <div key={pid} className="flex items-center gap-2 text-sm">
                                <span className="shrink-0 pk-mono text-red-300">PID {pid}</span>
                                <span className="shrink-0 pk-muted">-</span>
                                <span className="min-w-0 flex-1 truncate" title={processNames.get(pid) || 'Unknown'}>{processNames.get(pid) || 'Unknown'}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onCancel} disabled={isKilling} className="pk-button-ghost">
                            Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isKilling} className="bg-red-500/90 text-white hover:bg-red-400">
                            <Skull className="size-4" />
                            {isKilling ? 'Killing...' : 'Kill'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
