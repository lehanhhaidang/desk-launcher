import { Button } from '@pk/components/ui'
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
        <div className="pk-action-card">
            <div>
                <h3 className="pk-card-title">Actions</h3>
                <p className="pk-card-subtitle">Refresh, monitor, and terminate selected processes.</p>
            </div>

            <div className="pk-action-controls">
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                    <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>

                <button
                    type="button"
                    onClick={onToggleAutoRefresh}
                    className="pk-switch-button"
                    data-active={autoRefresh}
                    aria-pressed={autoRefresh}
                >
                    <span className="pk-switch-track">
                        <span className="pk-switch-thumb" />
                    </span>
                    <Zap className="size-4" />
                    <span>Auto refresh</span>
                    <strong>{autoRefresh ? 'ON' : 'OFF'}</strong>
                </button>

                <Button
                    variant="destructive"
                    size="sm"
                    onClick={onKill}
                    disabled={selectedCount === 0 || isKilling}
                    className="pk-kill-button"
                >
                    <Skull className="size-4" />
                    Kill {selectedCount > 0 ? `(${selectedCount})` : ''}
                </Button>
            </div>
        </div>
    )
}
