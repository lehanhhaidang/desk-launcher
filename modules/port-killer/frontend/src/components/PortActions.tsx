import { Button } from '@desk-launcher/ui'
import { RefreshCw, Skull } from 'lucide-react'

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
        <div className="flex flex-wrap items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
            >
                <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
            </Button>

            <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleAutoRefresh}
            >
                <RefreshCw className={`size-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto {autoRefresh ? 'ON' : 'OFF'}
            </Button>

            <div className="flex-1" />

            <Button
                variant="destructive"
                size="sm"
                onClick={onKill}
                disabled={selectedCount === 0 || isKilling}
            >
                <Skull className="size-4" />
                Kill {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
        </div>
    )
}
