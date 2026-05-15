import type { ReactNode } from 'react';
import { FileText, FolderPlus, History, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@os/components/ui';
import { DocSetCard } from '@os/features/doc-set/components/doc-set-card';
import type { DocSet, Workspace } from '@os/types/models';

interface WorkspaceDashboardProps {
    workspace: Workspace;
    docSets: DocSet[];
    onEditWorkspace: () => void;
    onDeleteWorkspace: () => void;
    onAddDocSet: () => void;
    onOpenDocSet: (docSet: DocSet) => void;
    onDeleteDocSet: (id: string) => void;
    onMoveDocSet?: (docSet: DocSet) => void;
}

export function WorkspaceDashboard({
    workspace,
    docSets,
    onEditWorkspace,
    onDeleteWorkspace,
    onAddDocSet,
    onOpenDocSet,
    onDeleteDocSet,
    onMoveDocSet,
}: WorkspaceDashboardProps) {
    const syncedCount = docSets.filter((ds) => ds.status === 'idle').length;
    const attentionCount = docSets.filter((ds) => ['pending', 'conflict', 'error'].includes(ds.status)).length;
    const providerCount = new Set(docSets.map((ds) => ds.provider_type)).size || 1;

    return (
        <div className="flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-5xl">
                <section className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--on-surface)]">
                            <span className="lux-text">{workspace.icon || '📁'} {workspace.name}</span>
                        </h1>
                        <p className="mt-1 text-sm font-medium text-[var(--on-surface-variant)]">Workspace Overview</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onEditWorkspace}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] text-[var(--on-surface-variant)] transition-all hover:-translate-y-0.5 hover:border-[rgba(183,156,255,0.45)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--primary)]"
                            title="Edit workspace"
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button
                            onClick={onDeleteWorkspace}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] text-[var(--on-surface-variant)] transition-all hover:-translate-y-0.5 hover:border-[var(--error)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--error)]"
                            title="Delete workspace"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </section>

                <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Metric label="Doc Sets" value={docSets.length} icon={<FileText className="h-5 w-5" />} />
                    <Metric label="Providers" value={providerCount} tone="tertiary" icon={<RefreshCw className="h-5 w-5" />} />
                    <Metric label="Need Attention" value={attentionCount} tone="error" icon={<History className="h-5 w-5" />} />
                </section>

                {docSets.length === 0 ? (
                    <section className="soft-panel purple-haze flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed text-center">
                        <div className="lux-gradient mb-5 flex h-16 w-16 items-center justify-center rounded-xl text-[#071413] shadow-[0_14px_40px_rgba(183,156,255,0.16)]">
                            <FolderPlus className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-bold text-[var(--on-surface)]">No doc sets yet</h2>
                        <p className="mt-2 max-w-sm text-sm text-[var(--on-surface-variant)]">
                            Add a folder to start managing and syncing project documentation.
                        </p>
                        <Button className="mt-6" onClick={onAddDocSet}>
                            <FolderPlus className="h-4 w-4" />
                            Add Doc Set
                        </Button>
                    </section>
                ) : (
                    <section>
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--on-surface)]">Recent Documents</h2>
                                <p className="text-sm text-[var(--on-surface-variant)]">{syncedCount} currently idle, {attentionCount} needing attention.</p>
                            </div>
                            <Button size="sm" onClick={onAddDocSet}>
                                <FolderPlus className="h-4 w-4" />
                                Add
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {docSets.map((docSet) => (
                                <DocSetCard
                                    key={docSet.id}
                                    docSet={docSet}
                                    onDelete={onDeleteDocSet}
                                    onOpen={onOpenDocSet}
                                    variant="dashboard"
                                    onMove={onMoveDocSet}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

function Metric({
    label,
    value,
    icon,
    tone = 'primary',
}: {
    label: string;
    value: number;
    icon: ReactNode;
    tone?: 'primary' | 'tertiary' | 'error';
}) {
    const color = tone === 'primary' ? 'var(--primary)' : tone === 'tertiary' ? 'var(--tertiary)' : 'var(--error)';

    return (
        <div className="soft-card flex items-center gap-4 rounded-xl border p-4 transition-all duration-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.045)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]" style={{ color }}>
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-[var(--on-surface)]">{value}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
            </div>
        </div>
    );
}
