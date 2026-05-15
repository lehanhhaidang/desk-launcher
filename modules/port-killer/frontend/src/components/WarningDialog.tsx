import { Button } from '@desk-launcher/ui'
import { AlertTriangle, ShieldAlert, X } from 'lucide-react'

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
    const iconColor = isDanger ? 'text-red-400' : 'text-yellow-400'
    const iconBg = isDanger ? 'bg-red-500/10' : 'bg-yellow-500/10'
    const borderColor = isDanger ? 'border-red-500/30' : 'border-yellow-500/30'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                <div className={`rounded-xl border ${borderColor} bg-card p-6 shadow-2xl`}>
                    <div className="mb-4 flex items-center gap-3">
                        <div className={`flex size-10 items-center justify-center rounded-full ${iconBg}`}>
                            <Icon className={`size-5 ${iconColor}`} />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold">{title}</h3>
                            <p className="text-sm text-muted-foreground">{message}</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {details && (
                        <div className="mb-5 max-h-48 overflow-y-auto rounded-lg bg-muted/30 p-3 text-sm">
                            {details}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onCancel}>
                            {showConfirm ? cancelLabel : 'OK'}
                        </Button>
                        {showConfirm && onConfirm && (
                            <Button
                                variant={isDanger ? 'destructive' : 'default'}
                                size="sm"
                                onClick={onConfirm}
                            >
                                {confirmLabel}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
