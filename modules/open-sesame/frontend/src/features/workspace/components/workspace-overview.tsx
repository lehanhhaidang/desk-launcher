import { useEffect, useState } from 'react';
import { Check, Download, FolderPlus, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { Button, Modal, Spinner } from '@os/components/ui';
import { invoke } from '@os/lib/tauri';
import { WorkspaceForm } from './workspace-form';
import { useWorkspaces } from '@os/features/workspace/hooks/use-workspaces';
import { useWorkspaceStore } from '@os/stores/workspace-store';
import { useAuthStore } from '@os/stores/auth-store';
import type { DocSet, Workspace } from '@os/types/models';

interface ImportResult {
    workspaces_created: number;
    doc_sets_created: number;
    errors: string[];
}

export function WorkspaceOverview() {
    const workspaces = useWorkspaceStore((s) => s.workspaces);
    const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
    const { createWorkspace, updateWorkspace, deleteWorkspace, fetchWorkspaces } = useWorkspaces();
    const accounts = useAuthStore((s) => s.accounts);

    const [docSetCounts, setDocSetCounts] = useState<Map<string, number>>(new Map());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingWs, setEditingWs] = useState<Workspace | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    useEffect(() => {
        invoke<DocSet[]>('doc_set_list_all').then((all) => {
            const counts = new Map<string, number>();
            for (const ds of all) {
                counts.set(ds.workspace_id, (counts.get(ds.workspace_id) ?? 0) + 1);
            }
            setDocSetCounts(counts);
        });
    }, [workspaces]);

    const toggleSelection = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selected.size === workspaces.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(workspaces.map((ws) => ws.id)));
        }
    };

    const handleExport = async () => {
        if (selected.size === 0) return;
        setExporting(true);
        try {
            const config = await invoke<unknown>('config_export', { workspaceIds: Array.from(selected) });
            const path = await save({
                defaultPath: 'open-sesame-config.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (path) {
                await invoke('write_text_file', { path, content: JSON.stringify(config, null, 2) });
            }
        } catch (err) {
            console.error('Export failed', err);
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async () => {
        const path = await open({
            filters: [{ name: 'JSON', extensions: ['json'] }],
            multiple: false,
        });
        if (!path) return;

        setImporting(true);
        try {
            const content = await invoke<string>('read_text_file', { path: path as string });
            const config = JSON.parse(content);
            const accountId = accounts[0]?.id;
            if (!accountId) {
                throw new Error('No GitHub account linked. Please sign in first.');
            }
            const result = await invoke<ImportResult>('config_import', { config, accountId });
            setImportResult(result);
            await fetchWorkspaces();
        } catch (err) {
            console.error('Import failed', err);
            setImportResult({ workspaces_created: 0, doc_sets_created: 0, errors: [String(err)] });
        } finally {
            setImporting(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!confirmDelete) return;
        await deleteWorkspace(confirmDelete.id);
        setConfirmDelete(null);
    };

    return (
        <div className="flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-5xl">
                {/* Header */}
                <section className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--on-surface)]">
                            <span className="lux-text">🏠 All Workspaces</span>
                        </h1>
                        <p className="mt-1 text-sm font-medium text-[var(--on-surface-variant)]">
                            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} • Click a workspace to open
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleImport}
                            disabled={importing}
                        >
                            {importing ? <Spinner size="sm" /> : <Upload className="h-4 w-4" />}
                            Import
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={selected.size === 0 || exporting}
                        >
                            {exporting ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}
                            Export{selected.size > 0 ? ` (${selected.size})` : ''}
                        </Button>
                    </div>
                </section>

                {/* Select All */}
                {workspaces.length > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                        <button
                            onClick={selectAll}
                            className="flex items-center gap-2 text-xs font-semibold text-[var(--on-surface-variant)] transition-colors hover:text-[var(--primary)]"
                        >
                            <div className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
                                selected.size === workspaces.length
                                    ? 'border-[var(--primary)] bg-[var(--primary)]'
                                    : 'border-[var(--outline-variant)]'
                            }`}>
                                {selected.size === workspaces.length && <Check className="h-3 w-3 text-[#071413]" />}
                            </div>
                            Select All
                        </button>
                    </div>
                )}

                {/* Workspace Grid */}
                {workspaces.length === 0 ? (
                    <section className="soft-panel purple-haze flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed text-center">
                        <div className="lux-gradient mb-5 flex h-16 w-16 items-center justify-center rounded-xl text-[#071413] shadow-[0_14px_40px_rgba(183,156,255,0.16)]">
                            <FolderPlus className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-bold text-[var(--on-surface)]">No workspaces yet</h2>
                        <p className="mt-2 max-w-sm text-sm text-[var(--on-surface-variant)]">
                            Create a workspace to organize your documentation projects, or import a config file.
                        </p>
                        <div className="mt-6 flex gap-3">
                            <Button onClick={() => setShowCreateForm(true)}>
                                <Plus className="h-4 w-4" />
                                Create Workspace
                            </Button>
                            <Button variant="outline" onClick={handleImport}>
                                <Upload className="h-4 w-4" />
                                Import Config
                            </Button>
                        </div>
                    </section>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {workspaces.map((ws) => {
                            const dsCount = docSetCounts.get(ws.id) ?? 0;
                            const isSelected = selected.has(ws.id);
                            return (
                                <article
                                    key={ws.id}
                                    className="soft-card group relative cursor-pointer rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
                                    onClick={() => setActiveWorkspace(ws.id)}
                                >
                                    {/* Checkbox */}
                                    <button
                                        className="absolute right-3 top-3 z-10"
                                        onClick={(e) => { e.stopPropagation(); toggleSelection(ws.id); }}
                                    >
                                        <div className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                                            isSelected
                                                ? 'border-[var(--primary)] bg-[var(--primary)]'
                                                : 'border-[var(--outline-variant)] opacity-0 group-hover:opacity-100'
                                        }`}>
                                            {isSelected && <Check className="h-3.5 w-3.5 text-[#071413]" />}
                                        </div>
                                    </button>

                                    {/* Icon + Name */}
                                    <div className="mb-3 flex items-center gap-3">
                                        <span className="text-2xl">{ws.icon || '📁'}</span>
                                        <h3 className="text-lg font-bold text-[var(--on-surface)]">{ws.name}</h3>
                                    </div>

                                    {/* Stats */}
                                    <p className="text-sm text-[var(--on-surface-variant)]">
                                        {dsCount} doc set{dsCount !== 1 ? 's' : ''}
                                    </p>

                                    {/* Actions */}
                                    <div className="mt-3 flex items-center gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingWs(ws); }}
                                            className="rounded-md p-1.5 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)] group-hover:opacity-100"
                                            title="Edit"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(ws); }}
                                            className="rounded-md p-1.5 text-[var(--on-surface-variant)] opacity-0 transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--error)] group-hover:opacity-100"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </article>
                            );
                        })}

                        {/* Add Workspace Card */}
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--outline-variant)] p-5 text-[var(--on-surface-variant)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(183,156,255,0.48)] hover:text-[var(--primary)]"
                        >
                            <Plus className="h-6 w-6" />
                            <span className="text-sm font-semibold">New Workspace</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Create Form */}
            <WorkspaceForm
                isOpen={showCreateForm}
                onClose={() => setShowCreateForm(false)}
                onSubmit={createWorkspace}
            />

            {/* Edit Form */}
            {editingWs && (
                <WorkspaceForm
                    isOpen={!!editingWs}
                    onClose={() => setEditingWs(null)}
                    title="Edit Workspace"
                    initialValues={{ name: editingWs.name, icon: editingWs.icon ?? '' }}
                    onSubmit={async (input) => {
                        await updateWorkspace(editingWs.id, input);
                        setEditingWs(null);
                    }}
                />
            )}

            {/* Delete Confirmation */}
            <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Workspace" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--on-surface-variant)]">
                        Delete <strong className="text-[var(--on-surface)]">{confirmDelete?.name}</strong> and all its doc sets?
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteWorkspace}>Delete</Button>
                    </div>
                </div>
            </Modal>

            {/* Import Result */}
            <Modal isOpen={!!importResult} onClose={() => setImportResult(null)} title="Import Complete" size="sm">
                <div className="space-y-4">
                    {importResult && (
                        <>
                            <div className="space-y-1 text-sm text-[var(--on-surface-variant)]">
                                <p>✅ {importResult.workspaces_created} workspace(s) created</p>
                                <p>✅ {importResult.doc_sets_created} doc set(s) imported</p>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="max-h-32 overflow-y-auto rounded-md bg-[rgba(255,0,0,0.06)] p-3">
                                    {importResult.errors.map((err, i) => (
                                        <p key={i} className="text-xs text-[var(--error)]">⚠ {err}</p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                    <div className="flex justify-end">
                        <Button size="sm" onClick={() => setImportResult(null)}>OK</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
