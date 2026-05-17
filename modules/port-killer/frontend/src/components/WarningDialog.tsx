import { AlertTriangle, ShieldAlert } from 'lucide-react'
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

interface WarningDialogProps {
    title: string
    message: string
    details?: React.ReactNode
    variant?: 'warning' | 'danger'
    confirmLabel?: string
    cancelLabel?: string
    onConfirm?: () => void
    onCancel: () => void
    showConfirm?: boolean
}

export function WarningDialog({
    title,
    message,
    details,
    variant = 'warning',
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    showConfirm = true,
}: WarningDialogProps) {
    const isDanger = variant === 'danger'
    const Icon = isDanger ? ShieldAlert : AlertTriangle

    return (
        <AlertDialog open onOpenChange={(open) => { if (!open) onCancel() }}>
            <AlertDialogContent className={isDanger ? 'border-red-500/25' : 'border-yellow-500/25'}>
                <AlertDialogHeader>
                    <AlertDialogMedia className={isDanger ? 'bg-red-500/10' : 'bg-yellow-500/10'}>
                        <Icon className={isDanger ? 'text-red-400' : 'text-yellow-400'} />
                    </AlertDialogMedia>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{message}</AlertDialogDescription>
                </AlertDialogHeader>

                {details && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border bg-background/50 p-3 text-sm">
                        {details}
                    </div>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel size="sm">
                        {showConfirm ? cancelLabel : 'OK'}
                    </AlertDialogCancel>
                    {showConfirm && onConfirm && (
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); onConfirm() }}
                            size="sm"
                            variant={isDanger ? 'destructive' : 'default'}
                        >
                            {confirmLabel}
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
