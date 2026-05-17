import { Skull } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from '@pk/components/ui/alert-dialog'

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
        <AlertDialog open onOpenChange={(open) => { if (!open && !isKilling) onCancel() }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogMedia className="bg-red-500/10">
                        <Skull className="text-red-400" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>
                        Kill {pids.length} process{pids.length > 1 ? 'es' : ''}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-background/50 p-3">
                    {pids.map((pid) => (
                        <div key={pid} className="flex items-center gap-2 text-sm">
                            <span className="shrink-0 pk-mono text-red-400">PID {pid}</span>
                            <span className="shrink-0 text-muted-foreground">-</span>
                            <span className="min-w-0 flex-1 truncate" title={processNames.get(pid) || 'Unknown'}>
                                {processNames.get(pid) || 'Unknown'}
                            </span>
                        </div>
                    ))}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isKilling} size="sm">
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); onConfirm() }}
                        disabled={isKilling}
                        size="sm"
                        variant="destructive"
                    >
                        <Skull className="size-4" />
                        {isKilling ? 'Killing...' : 'Kill'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
