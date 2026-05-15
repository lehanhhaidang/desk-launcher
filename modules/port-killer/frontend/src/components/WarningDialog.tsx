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
        <div className="pk-dialog-backdrop">
            <div className="pk-dialog max-w-sm animate-in fade-in zoom-in-95 duration-200">
                <div className={`pk-panel rounded-xl border ${borderColor} p-5 shadow-2xl`}>
                    <div className="mb-4 flex items-start gap-3">
                        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                            <Icon className={`size-5 ${iconColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold leading-tight">{title}</h3>
                            <p className="mt-1 text-sm leading-snug pk-subtle">{message}</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="shrink-0 pk-muted hover:text-[#edf3f7]"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {details && (
                        <div className="mb-5 max-h-48 overflow-y-auto rounded-lg border border-blue-200/10 bg-black/20 p-3 text-sm">
                            {details}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onCancel} className="pk-button-ghost">
                            {showConfirm ? cancelLabel : 'OK'}
                        </Button>
                        {showConfirm && onConfirm && (
                            <Button
                                variant={isDanger ? 'destructive' : 'default'}
                                size="sm"
                                onClick={onConfirm}
                                className={isDanger ? 'bg-red-500/90 text-white hover:bg-red-400' : 'pk-button-primary'}
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
