import { openPath } from '@tauri-apps/plugin-opener';
import { ExternalLink, FileText, FolderOpen, GitBranch, HardDrive, MoveRight, Trash2 } from 'lucide-react';
import type { DocSet } from '@os/types/models';

interface DocSetCardProps {
    docSet: DocSet;
    onDelete: (id: string) => void;
    onOpen?: (docSet: DocSet) => void;
    onMove?: (docSet: DocSet) => void;
    isActive?: boolean;
    variant?: 'panel' | 'dashboard';
}

const statusTone: Record<string, { dot: string; label: string }> = {
    idle: { dot: 'bg-[var(--primary-container)]', label: 'Synced' },
    syncing: { dot: 'bg-[var(--primary)] animate-pulse', label: 'Syncing' },
    pending: { dot: 'bg-[var(--tertiary)]', label: 'Pending' },
    conflict: { dot: 'bg-[var(--error)]', label: 'Conflict' },
    error: { dot: 'bg-[var(--error)]', label: 'Error' },
    disconnected: { dot: 'bg-[var(--outline)]', label: 'Disconnected' },
};

export function DocSetCard({
    docSet,
    onDelete,
    onOpen,
    onMove,
    isActive = false,
    variant = 'panel',
}: DocSetCardProps) {
    const status = statusTone[docSet.status] || statusTone.idle;
    const isDashboard = variant === 'dashboard';
    const mirrorFolder = docSet.mirror_path || docSet.source_path;

    const openMirrorFolder = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        try {
            await openPath(mirrorFolder);
        } catch (err) {
            console.error('Failed to open doc set folder', err);
        }
    };

    const openGitHub = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (docSet.remote_url) {
            const url = docSet.remote_url
                .replace(/\.git$/, '')
                .replace(/^git@github\.com:/, 'https://github.com/');
            void import('@tauri-apps/plugin-opener').then((m) => m.openUrl(url));
        }
    };

    return (
        <article
            className={`soft-card group cursor-pointer rounded-xl border transition-all duration-200 ${
                isActive
                    ? 'border-[rgba(183,156,255,0.52)] bg-[linear-gradient(145deg,rgba(183,156,255,0.16),rgba(124,238,230,0.08))]'
                    : ''
            } ${isDashboard ? 'p-4' : 'p-3'}`}
            onClick={() => onOpen?.(docSet)}
        >
            <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--purple)]" />
                    <h3 className="truncate text-[13px] font-bold text-[var(--on-surface)]">
                        {docSet.display_name}
                    </h3>
                </div>
                <div className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} title={status.label} />
            </div>

            {isDashboard && (
                <p className="mb-3 truncate text-xs font-medium text-[var(--on-surface-variant)]">
                    {docSet.source_path}
                </p>
            )}

            <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--on-surface-variant)]">
                {docSet.provider_type === 'google_drive' ? (
                    <HardDrive className="h-3.5 w-3.5" />
                ) : (
                    <GitBranch className="h-3.5 w-3.5" />
                )}
                <span>{providerName(docSet.provider_type)}</span>
                <span className="text-[var(--outline)]">•</span>
                <span className={docSet.status === 'pending' ? 'text-[var(--tertiary)]' : docSet.status === 'error' || docSet.status === 'conflict' ? 'text-[var(--error)]' : ''}>
                    {status.label}
                </span>
                <span className="text-[var(--outline)]">•</span>
                <span>{docSet.strategy === 'mirrored' ? 'Mirrored' : 'Standalone'}</span>
            </div>

            {docSet.remote_url && !docSet.has_mapping && (
                <div className="mt-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(255,183,77,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#ffb74d] ring-1 ring-[rgba(255,183,77,0.25)]">
                        ⚠ Needs Mapping
                    </span>
                </div>
            )}

            <div className="mt-3 flex items-center justify-between">
                <span className="truncate text-[11px] font-medium text-[color-mix(in_srgb,var(--on-surface-variant)_70%,transparent)]">
                    {docSet.last_synced_at ? new Date(docSet.last_synced_at).toLocaleString() : 'Not synced yet'}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {docSet.remote_url && (
                        <button
                            onClick={openGitHub}
                            className="rounded-md p-1 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)] group-hover:opacity-100"
                            title="Open on GitHub"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button
                        onClick={(event) => void openMirrorFolder(event)}
                        className="rounded-md p-1 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)] group-hover:opacity-100"
                        title={docSet.mirror_path ? 'Open mirror folder' : 'Open local folder'}
                    >
                        <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                    {onMove && (
                        <button
                            onClick={(event) => { event.stopPropagation(); onMove(docSet); }}
                            className="rounded-md p-1 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)] group-hover:opacity-100"
                            title="Move to another workspace"
                        >
                            <MoveRight className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete(docSet.id);
                        }}
                        className="rounded-md p-1 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--error)] group-hover:opacity-100"
                        title="Delete doc set"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </article>
    );
}

function providerName(provider: string) {
    if (provider === 'github') return 'GitHub';
    if (provider === 'gitlab') return 'GitLab';
    if (provider === 'google_drive') return 'Drive';
    return provider;
}
