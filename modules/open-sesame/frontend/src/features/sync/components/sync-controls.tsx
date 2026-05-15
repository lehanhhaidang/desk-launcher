import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { useSync } from '../hooks/use-sync';
import { Button, Modal, Spinner } from '@os/components/ui';
import { GithubRemoteSetupModal } from './github-remote-setup-modal';

import type { DocSet } from '@os/types/models';
import type { SyncIssue } from '../hooks/use-sync';

interface SyncControlsProps {
    docSet: DocSet;
    onDocSetUpdated: (docSet: DocSet) => void;
    onFilesChanged?: () => void;
    onToggleMapping?: () => void;
    mappingActive?: boolean;
}

export function SyncControls({ docSet, onDocSetUpdated, onFilesChanged, onToggleMapping, mappingActive }: SyncControlsProps) {
    const [showSetup, setShowSetup] = useState(false);
    const [issue, setIssue] = useState<SyncIssue | null>(null);
    const [confirmAction, setConfirmAction] = useState<'force_push' | 'force_pull' | null>(null);
    const { isSyncing, syncStatus, syncUp, syncDown, forcePush, forcePull, refreshStatus } = useSync(docSet.id);
    const needsSetup = !docSet.remote_url || syncStatus === 'setup_required';
    const needsMapping = docSet.remote_url != null && !docSet.has_mapping;
    const syncDisabled = isSyncing || needsMapping;

    const setAutoSync = async (enabled: boolean) => {
        const updated = await invoke<DocSet>('doc_set_set_auto_sync', { id: docSet.id, enabled });
        onDocSetUpdated(updated);
    };

    const handlePush = () => {
        if (needsSetup) {
            setShowSetup(true);
            return;
        }
        void syncUp().then((result) => {
            if (result?.issue) setIssue(result.issue);
            else onFilesChanged?.();
        });
    };

    const handlePull = () => {
        if (needsSetup) {
            setShowSetup(true);
            return;
        }
        void syncDown().then((result) => {
            if (result?.issue) setIssue(result.issue);
            else onFilesChanged?.();
        });
    };

    const handleForceAction = async () => {
        if (!confirmAction) return;
        const result = confirmAction === 'force_push'
            ? await forcePush('force sync from Open Sesame')
            : await forcePull();
        setConfirmAction(null);
        if (result.issue) {
            setIssue(result.issue);
        } else {
            setIssue(null);
            void refreshStatus();
            onFilesChanged?.();
        }
    };

    useAutoSync({
        enabled: docSet.auto_sync && !needsSetup,
        isSyncing,
        onTick: async () => {
            const result = await syncUp('auto sync from Open Sesame');
            if (result.issue) {
                setIssue(result.issue);
                await setAutoSync(false);
            } else {
                void refreshStatus();
                onFilesChanged?.();
            }
        },
    });

    return (
        <div className="flex items-center gap-2">
            {needsSetup && (
                <Button size="sm" onClick={() => setShowSetup(true)} title="Setup GitHub repository">
                    <GitBranch className="h-3.5 w-3.5" />
                    Setup GitHub
                </Button>
            )}

            <Button variant={mappingActive ? 'default' : 'outline'} size="sm" onClick={onToggleMapping} title="Configure local paths for this device">
                Device Paths
            </Button>

            <Button onClick={handlePush} disabled={syncDisabled} title={needsMapping ? 'Map device paths first' : 'Push local changes'}>
                {isSyncing ? <Spinner size="sm" /> : <ArrowUp className="w-3.5 h-3.5" />}
                {isSyncing ? 'Working' : 'Push'}
            </Button>

            <Button variant="outline" onClick={handlePull} disabled={syncDisabled} title={needsMapping ? 'Map device paths first' : 'Pull remote changes'}>
                <ArrowDown className="w-3.5 h-3.5" />
                Pull
            </Button>

            <button
                onClick={refreshStatus}
                disabled={isSyncing}
                className="rounded p-1.5 text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--primary)]"
                title="Refresh status"
            >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            <SyncStatusBadge status={syncStatus} />

            <label
                className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container)] px-2.5 text-xs font-bold text-[var(--on-surface-variant)]"
                title={needsSetup ? 'Setup GitHub before enabling auto-sync' : 'Auto-sync while Open Sesame is running'}
            >
                <input
                    type="checkbox"
                    checked={docSet.auto_sync}
                    disabled={needsSetup || isSyncing}
                    onChange={(event) => void setAutoSync(event.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                Auto
            </label>

            <GithubRemoteSetupModal
                docSet={docSet}
                isOpen={showSetup}
                onClose={() => setShowSetup(false)}
                onSetup={(updated) => {
                    onDocSetUpdated(updated);
                    void refreshStatus();
                    onFilesChanged?.();
                }}
            />



            <SyncIssueModal
                issue={issue}
                onClose={() => setIssue(null)}
                onRetry={() => {
                    setIssue(null);
                    void refreshStatus();
                }}
                onForcePush={() => setConfirmAction('force_push')}
                onForcePull={() => setConfirmAction('force_pull')}
                onSetup={() => {
                    setIssue(null);
                    setShowSetup(true);
                }}
            />

            <Modal
                isOpen={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                title={confirmAction === 'force_push' ? 'Overwrite Remote?' : 'Overwrite Local Mirror?'}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-[var(--on-surface-variant)]">
                        {confirmAction === 'force_push'
                            ? 'Open Sesame will force push your local mirror to GitHub. Remote commits not in this mirror may be lost.'
                            : 'Open Sesame will force pull GitHub into your local mirror and copy it back to the source folder. Local mirror changes may be lost.'}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                            Cancel
                        </Button>
                        <Button variant="danger" size="sm" onClick={handleForceAction} disabled={isSyncing}>
                            {isSyncing && <Spinner size="sm" />}
                            Confirm
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function useAutoSync({
    enabled,
    isSyncing,
    onTick,
}: {
    enabled: boolean;
    isSyncing: boolean;
    onTick: () => Promise<void>;
}) {
    useEffect(() => {
        if (!enabled) return;

        const interval = window.setInterval(() => {
            if (!isSyncing) {
                void onTick();
            }
        }, 5 * 60 * 1000);

        return () => window.clearInterval(interval);
    }, [enabled, isSyncing, onTick]);
}

function SyncIssueModal({
    issue,
    onClose,
    onRetry,
    onForcePush,
    onForcePull,
    onSetup,
}: {
    issue: SyncIssue | null;
    onClose: () => void;
    onRetry: () => void;
    onForcePush: () => void;
    onForcePull: () => void;
    onSetup: () => void;
}) {
    if (!issue) return null;

    return (
        <Modal isOpen onClose={onClose} title="Sync Needs Attention" size="md">
            <div className="space-y-4">
                <div className="rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[var(--error-container)] px-3 py-2">
                    <p className="text-sm font-bold text-[var(--error)]">{issue.kind.replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-sm text-[var(--error)]">{issue.message}</p>
                </div>
                {issue.details && (
                    <p className="text-sm text-[var(--on-surface-variant)]">{issue.details}</p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    {issue.actions.includes('setup_github') && (
                        <Button size="sm" onClick={onSetup}>Setup GitHub</Button>
                    )}
                    {issue.actions.includes('retry') && (
                        <Button variant="outline" size="sm" onClick={onRetry}>Retry Later</Button>
                    )}
                    {issue.actions.includes('force_pull') && (
                        <Button variant="outline" size="sm" onClick={onForcePull}>Force Pull</Button>
                    )}
                    {issue.actions.includes('force_push') && (
                        <Button variant="danger" size="sm" onClick={onForcePush}>Force Push</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
}

function SyncStatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        up_to_date: { label: 'Up to date', className: 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-[var(--primary)]' },
        local_changes: { label: 'Changes', className: 'border-[color-mix(in_srgb,var(--tertiary)_45%,transparent)] text-[var(--tertiary)]' },
        setup_required: { label: 'Setup required', className: 'border-[color-mix(in_srgb,var(--tertiary)_45%,transparent)] text-[var(--tertiary)]' },
        not_initialized: { label: 'Not synced', className: 'border-[var(--outline-variant)] text-[var(--on-surface-variant)]' },
        error: { label: 'Error', className: 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]' },
        conflict: { label: 'Conflict', className: 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]' },
        unknown: { label: '...', className: 'border-[var(--outline-variant)] text-[var(--on-surface-variant)]' },
    };
    const { label, className } = config[status] ?? config.unknown;
    return <span className={`flex h-8 items-center rounded-md border bg-[var(--surface-container)] px-2.5 text-xs font-bold ${className}`}>{label}</span>;
}
