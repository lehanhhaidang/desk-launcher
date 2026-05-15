import { Button } from '@desk-launcher/ui'
import { RefreshCw, Skull, Zap } from 'lucide-react'

interface PortActionsProps {
    selectedCount: number
    onKill: () => void
    onRefresh: () => void
    isRefreshing: boolean
    isKilling: boolean
    autoRefresh: boolean
    onToggleAutoRefresh: () => void
}

export function PortActions({
    selectedCount,
    onKill,
    onRefresh,
    isRefreshing,
    isKilling,
    autoRefresh,
    onToggleAutoRefresh,
}: PortActionsProps) {
    return (
        <div className="pk-panel flex flex-wrap items-center gap-2 rounded-xl p-3">
            <div className="mr-2 hidden min-w-0 sm:block">
                <div className="pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Control surface</div>
                <div className="text-sm font-semibold text-[#edf3f7]">Process actions</div>
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="border-white/10 bg-white/[0.035] text-[#edf3f7] hover:bg-white/[0.07]"
            >
                <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={onToggleAutoRefresh}
                className={
                    autoRefresh
                        ? 'border-emerald-200/20 bg-emerald-200/10 text-emerald-100 hover:bg-emerald-200/15'
                        : 'border-white/10 bg-white/[0.035] text-[#aeb8c7] hover:bg-white/[0.07] hover:text-[#edf3f7]'
                }
            >
                <Zap className={`size-4 ${autoRefresh ? 'text-emerald-200' : ''}`} />
                Auto {autoRefresh ? 'ON' : 'OFF'}
            </Button>

            <div className="flex-1" />

            <Button
                variant="destructive"
                size="sm"
                onClick={onKill}
                disabled={selectedCount === 0 || isKilling}
                className="bg-red-500/90 text-white hover:bg-red-400 disabled:bg-white/[0.035] disabled:text-[#788495]"
            >
                <Skull className="size-4" />
                Kill {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
        </div>
    )
}
