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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                <div className="rounded-xl border border-border/50 bg-card p-6 shadow-2xl">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-red-500/10">
                            <Skull className="size-5 text-red-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold">Kill {pids.length} process{pids.length > 1 ? 'es' : ''}?</h3>
                            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="ml-auto text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="mb-5 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/30 p-3">
                        {pids.map((pid) => (
                            <div key={pid} className="flex items-center gap-2 text-sm">
                                <span className="font-mono text-red-400">PID {pid}</span>
                                <span className="text-muted-foreground">—</span>
                                <span className="truncate">{processNames.get(pid) || 'Unknown'}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onCancel} disabled={isKilling}>
                            Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isKilling}>
                            <Skull className="size-4" />
                            {isKilling ? 'Killing...' : 'Kill'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
