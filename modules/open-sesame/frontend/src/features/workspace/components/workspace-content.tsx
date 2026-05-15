import { useEffect, useState } from 'react';
import { FileText, FolderPlus, MoveRight, Search } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { Button, Modal } from '@os/components/ui';
import { DocSetCard } from '@os/features/doc-set/components/doc-set-card';
import { DocSetForm } from '@os/features/doc-set/components/doc-set-form';
import { ExplorerLayout } from '@os/features/explorer/components/explorer-layout';
import { useDocSets } from '@os/features/doc-set/hooks/use-doc-sets';
import { WorkspaceDashboard } from '@os/features/workspace/components/workspace-dashboard';
import { WorkspaceOverview } from '@os/features/workspace/components/workspace-overview';
import { WorkspaceForm } from '@os/features/workspace/components/workspace-form';
import { useWorkspaces } from '@os/features/workspace/hooks/use-workspaces';
import { useWorkspaceStore } from '@os/stores/workspace-store';
import type { DocSet, Workspace } from '@os/types/models';

export function WorkspaceContent() {
    const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
    const workspaces = useWorkspaceStore((s) => s.workspaces);
    const { updateWorkspace, deleteWorkspace } = useWorkspaces();
    const { docSets, fetchDocSets, deleteDocSet } = useDocSets(activeWorkspaceId);

    const [activeDocSet, setActiveDocSet] = useState<DocSet | null>(null);
    const [editingWs, setEditingWs] = useState<Workspace | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null);
    const [showDocSetForm, setShowDocSetForm] = useState(false);
    const [newDocSetId, setNewDocSetId] = useState<string | null>(null);
    const [confirmDeleteDs, setConfirmDeleteDs] = useState<string | null>(null);
    const [movingDocSet, setMovingDocSet] = useState<DocSet | null>(null);

    const workspace = workspaces.find((w) => w.id === activeWorkspaceId);

    useEffect(() => {
        fetchDocSets();
    }, [fetchDocSets]);

    useEffect(() => {
        setActiveDocSet(null);
    }, [activeWorkspaceId]);

    const handleDeleteWorkspace = async () => {
        if (!confirmDelete) return;
        await deleteWorkspace(confirmDelete.id);
        setConfirmDelete(null);
    };

    const handleDeleteDocSet = async () => {
        if (!confirmDeleteDs) return;
        await deleteDocSet(confirmDeleteDs);
        setConfirmDeleteDs(null);
    };

    const handleDocSetUpdated = (docSet: DocSet) => {
        setActiveDocSet(docSet);
        void fetchDocSets();
    };

    if (!workspace) {
        return <WorkspaceOverview />;
    }

    return (
        <div className="flex min-w-0 flex-1">
            <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--outline-variant)] bg-[rgba(18,20,29,0.68)] shadow-[14px_0_40px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="border-b border-[var(--outline-variant)] p-4">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(183,156,255,0.25)] bg-[var(--purple-soft)] text-[var(--primary)] shadow-[0_10px_24px_rgba(183,156,255,0.08)]">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-xl font-bold text-[var(--on-surface)]">Doc Sets</h2>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">
                                Managing {docSets.length} project{docSets.length === 1 ? '' : 's'}
                            </p>
                        </div>
                    </div>
                    <Button className="w-full" size="sm" onClick={() => setShowDocSetForm(true)}>
                        <FolderPlus className="h-4 w-4" />
                        Add Doc Set
                    </Button>
                </div>

                <div className="border-b border-[var(--outline-variant)] p-3">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                        <input
                            className="h-8 w-full rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] pl-8 pr-3 text-[13px] text-[var(--on-surface)] outline-none transition-all placeholder:text-[color-mix(in_srgb,var(--on-surface-variant)_60%,transparent)] focus:border-[rgba(183,156,255,0.5)] focus:bg-[rgba(255,255,255,0.055)]"
                            placeholder="Filter docs..."
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {docSets.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                            No doc sets yet.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {docSets.map((docSet) => (
                                <DocSetCard
                                    key={docSet.id}
                                    docSet={docSet}
                                    isActive={activeDocSet?.id === docSet.id}
                                    onDelete={(id) => setConfirmDeleteDs(id)}
                                    onOpen={setActiveDocSet}
                                    onMove={workspaces.length > 1 ? setMovingDocSet : undefined}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col">

                {activeDocSet ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--outline-variant)] bg-[rgba(28,31,44,0.56)] px-4 backdrop-blur-xl">
                            <button
                                onClick={() => setActiveDocSet(null)}
                                className="flex items-center gap-1 rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[13px] font-semibold text-[var(--on-surface)] transition-colors hover:border-[rgba(183,156,255,0.45)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[var(--primary)]"
                            >
                                ← Back
                            </button>
                            <h1 className="truncate text-lg font-bold text-[var(--on-surface)]">{activeDocSet.display_name}</h1>
                            <span className="truncate rounded border border-[var(--outline-variant)] bg-[var(--surface-high)] px-2 py-0.5 text-[11px] font-semibold text-[var(--on-surface-variant)]">
                                {activeDocSet.source_path}
                            </span>
                        </div>
                        <ExplorerLayout docSet={activeDocSet} onDocSetUpdated={handleDocSetUpdated} initialShowMapping={activeDocSet.id === newDocSetId} />
                    </div>
                ) : (
                    <WorkspaceDashboard
                        workspace={workspace}
                        docSets={docSets}
                        onEditWorkspace={() => setEditingWs(workspace)}
                        onDeleteWorkspace={() => setConfirmDelete(workspace)}
                        onAddDocSet={() => setShowDocSetForm(true)}
                        onOpenDocSet={setActiveDocSet}
                        onDeleteDocSet={(id) => setConfirmDeleteDs(id)}
                        onMoveDocSet={workspaces.length > 1 ? setMovingDocSet : undefined}
                    />
                )}
            </main>

            {editingWs && (
                <WorkspaceForm
                    isOpen
                    onClose={() => setEditingWs(null)}
                    onSubmit={async (input) => {
                        await updateWorkspace(editingWs.id, { name: input.name, icon: input.icon });
                    }}
                    initialValues={{ name: editingWs.name, icon: editingWs.icon || '' }}
                    title="Edit Workspace"
                />
            )}

            <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Workspace" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--on-surface-variant)]">
                        Delete <strong className="text-[var(--on-surface)]">{confirmDelete?.name}</strong>? All doc sets in this workspace will also be removed.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteWorkspace}>Delete</Button>
                    </div>
                </div>
            </Modal>

            <DocSetForm
                isOpen={showDocSetForm}
                workspaceId={workspace.id}
                onClose={() => setShowDocSetForm(false)}
                onCreated={(docSet) => {
                    setActiveDocSet(docSet);
                    setNewDocSetId(docSet.id);
                    void fetchDocSets();
                }}
            />



            <Modal isOpen={!!confirmDeleteDs} onClose={() => setConfirmDeleteDs(null)} title="Delete Doc Set" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--on-surface-variant)]">The source files will not be affected.</p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteDs(null)}>Cancel</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteDocSet}>Delete</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={!!movingDocSet} onClose={() => setMovingDocSet(null)} title="Move Doc Set" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--on-surface-variant)]">
                        Move <strong className="text-[var(--on-surface)]">{movingDocSet?.display_name}</strong> to:
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {workspaces
                            .filter((w) => w.id !== movingDocSet?.workspace_id)
                            .map((ws) => (
                                <button
                                    key={ws.id}
                                    onClick={async () => {
                                        if (!movingDocSet) return;
                                        try {
                                            await invoke('doc_set_move', { id: movingDocSet.id, workspaceId: ws.id });
                                            setMovingDocSet(null);
                                            setActiveDocSet(null);
                                            void fetchDocSets();
                                        } catch (err) {
                                            console.error('Failed to move doc set', err);
                                        }
                                    }}
                                    className="flex items-center gap-3 rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-left transition-all hover:border-[rgba(183,156,255,0.45)] hover:bg-[rgba(255,255,255,0.06)]"
                                >
                                    <span className="text-lg">{ws.icon || '📁'}</span>
                                    <span className="text-sm font-semibold text-[var(--on-surface)]">{ws.name}</span>
                                    <MoveRight className="ml-auto h-4 w-4 text-[var(--on-surface-variant)]" />
                                </button>
                            ))}
                    </div>
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setMovingDocSet(null)}>Cancel</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
