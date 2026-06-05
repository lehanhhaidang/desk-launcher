import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, GitBranch, Plus, RefreshCw } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { Button, Input, Modal, Spinner } from '@os/components/ui';
import type {
    AddMirrorSourceInput,
    AddSourceInput,
    DocSet,
    MappingPreflight,
    MappingOverview,
    SetSourceMappingInput,
    SourceMappingView,
} from '@os/types/models';
import { MappingPreflightDialog } from './MappingPreflightDialog';
import { MappingTree } from './MappingTree';
import { SelectedMappingPanel } from './SelectedMappingPanel';
import type { FileNode, MappingAction, MappingPreflightRequest } from './source-mapping-types';
import {
    collectNodes,
    findNode,
    getEffectiveMappedPath,
    joinLocalPath,
    relativeMirrorPath,
    withTimeout,
} from './source-mapping-utils';

interface SourceMappingPanelProps {
    docSet: DocSet;
    onClose: () => void;
    onDocSetUpdated?: (docSet: DocSet) => void;
}

export function SourceMappingPanel({ docSet, onClose, onDocSetUpdated }: SourceMappingPanelProps) {
    const [overview, setOverview] = useState<MappingOverview | null>(null);
    const [tree, setTree] = useState<FileNode | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [alias, setAlias] = useState('');
    const [sourcePath, setSourcePath] = useState('');
    const [showAddSource, setShowAddSource] = useState(false);
    const [selectedPath, setSelectedPath] = useState('.');
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));
    const [pendingCheckedPaths, setPendingCheckedPaths] = useState<Set<string>>(new Set());
    const [draftLocalPaths, setDraftLocalPaths] = useState<Record<string, string>>({});
    const [preflightRequest, setPreflightRequest] = useState<MappingPreflightRequest | null>(null);

    const mirrorPath = docSet.mirror_path || docSet.source_path;

    const load = async () => {
        setLoading(true);
        setError('');
        setTree(null);
        try {
            const mappingData = await invoke<MappingOverview>('doc_set_sources', { docSetId: docSet.id });
            setOverview(mappingData);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        try {
            const treeData = await withTimeout(
                invoke<FileNode>('file_tree', {
                    sourcePath: mirrorPath,
                    maxDepth: 4,
                    includeGitStatus: false,
                }),
                12_000,
                'Repo tree is taking too long to load. Try Refresh again after checking the mirror folder.',
            );
            setTree(treeData);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [docSet.id]);

    const mappedByPath = useMemo(() => {
        const map = new Map<string, SourceMappingView>();
        overview?.sources.forEach((source) => map.set(source.source.mirror_path, source));
        return map;
    }, [overview]);

    const mappedPaths = useMemo(() => {
        const paths = new Map<string, string>();
        overview?.sources.forEach((source) => {
            if (source.mapping.local_path) {
                paths.set(source.source.mirror_path, source.mapping.local_path);
            }
        });
        return paths;
    }, [overview]);

    const selectedNode = useMemo(() => {
        if (!tree) return null;
        return findNode({ ...tree, name: docSet.display_name, path: '.' }, selectedPath);
    }, [tree, selectedPath, docSet.display_name]);

    const selectedSource = selectedNode ? mappedByPath.get(selectedNode.path || '.') : undefined;

    const browseSource = async () => {
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === 'string') {
            setSourcePath(selected);
            if (!alias) {
                setAlias(selected.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Source');
            }
        }
    };

    const addExternalSource = async () => {
        if (!sourcePath || !alias.trim()) {
            setError('Source folder and alias are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const input: AddSourceInput = {
                doc_set_id: docSet.id,
                source_path: sourcePath,
                alias: alias.trim(),
            };
            const data = await invoke<MappingOverview>('doc_set_add_source', { input });
            setOverview(data);
            setAlias('');
            setSourcePath('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const removeNewMirrorPath = async (node: FileNode) => {
        const mirrorPathForNode = node.path || '.';
        const confirmed = window.confirm(
            `Remove "${node.name}" from the mirror? This is only allowed for new files or folders that have not been pushed yet.`,
        );
        if (!confirmed) return;

        setLoading(true);
        setError('');
        try {
            await invoke<MappingOverview>('doc_set_remove_new_mirror_path', {
                input: {
                    doc_set_id: docSet.id,
                    mirror_path: mirrorPathForNode,
                },
            });
            setPendingCheckedPaths((current) => {
                const next = new Set(current);
                collectNodes(node).forEach((currentNode) => next.delete(currentNode.path || '.'));
                return next;
            });
            setDraftLocalPaths((current) => {
                const next = { ...current };
                collectNodes(node).forEach((currentNode) => delete next[currentNode.path || '.']);
                return next;
            });
            setSelectedPath('.');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const updateMapping = async (source: SourceMappingView, patch: Partial<SetSourceMappingInput>) => {
        const input: SetSourceMappingInput = {
            doc_set_id: docSet.id,
            source_id: source.source.id,
            local_path: source.mapping.local_path || undefined,
            enabled: source.mapping.enabled,
            direction: source.mapping.direction,
            ...patch,
        };
        const data = await invoke<MappingOverview>('doc_set_set_source_mapping', { input });
        setOverview(data);

        // Refetch doc set to get updated has_mapping
        if (onDocSetUpdated) {
            try {
                const allDocSets = await invoke<DocSet[]>('doc_set_list', { workspaceId: docSet.workspace_id });
                const updated = allDocSets.find((ds) => ds.id === docSet.id);
                if (updated) onDocSetUpdated(updated);
            } catch { /* ignore */ }
        }

        return data;
    };

    const ensureMirrorSource = async (node: FileNode) => {
        const mirrorPathForNode = node.path || '.';
        const existing = mappedByPath.get(mirrorPathForNode);
        if (existing) return existing;

        const input: AddMirrorSourceInput = {
            doc_set_id: docSet.id,
            mirror_path: mirrorPathForNode,
            alias: node.path ? node.name : docSet.display_name,
        };
        const data = await invoke<MappingOverview>('doc_set_add_mirror_source', { input });
        setOverview(data);
        const created = data.sources.find((source) => source.source.mirror_path === mirrorPathForNode);
        if (!created) throw new Error('Could not create mapping source.');
        return created;
    };

    const toggleNodeChecked = (node: FileNode, checked: boolean) => {
        const paths = collectNodes(node).map((current) => current.path || '.');
        setPendingCheckedPaths((current) => {
            const next = new Set(current);
            paths.forEach((path) => {
                if (checked) {
                    next.add(path);
                } else {
                    next.delete(path);
                }
            });
            return next;
        });
    };

    const runPreflight = async (node: FileNode, localPath: string, action: MappingAction) => {
        setLoading(true);
        setError('');
        try {
            const preflight = await invoke<MappingPreflight>('doc_set_mapping_preflight', {
                input: {
                    doc_set_id: docSet.id,
                    mirror_path: node.path || '.',
                    local_path: localPath,
                },
            });
            const hasDifferences =
                preflight.conflicts > 0 || preflight.only_local > 0 || preflight.only_mirror > 0;
            if (!hasDifferences) {
                // Nothing to overwrite or add → apply directly.
                await confirmSelectedMapping(node, localPath, action);
            } else {
                setPreflightRequest({ node, localPath, action, preflight });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const confirmSelectedMapping = async (
        node: FileNode,
        localPath: string,
        action: MappingAction,
    ) => {
        const nodes = collectNodes(node);
        const basePath = node.path || '.';
        setLoading(true);
        setError('');
        try {
            for (const current of nodes) {
                const source = await ensureMirrorSource(current);
                const relative = relativeMirrorPath(basePath, current.path || '.');
                await updateMapping(source, {
                    enabled: true,
                    direction: 'two_way',
                    local_path: current === node ? localPath : joinLocalPath(localPath, relative),
                });
            }
            setPendingCheckedPaths((current) => {
                const next = new Set(current);
                nodes.forEach((currentNode) => next.delete(currentNode.path || '.'));
                return next;
            });
            if (action === 'push') {
                await invoke<number>('doc_set_push_from_local', { docSetId: docSet.id });
            } else {
                await invoke<number>('doc_set_pull_from_repo', { docSetId: docSet.id });
            }
            setPreflightRequest(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const selectNode = (node: FileNode) => {
        const path = node.path || '.';
        setSelectedPath(path);
        if (node.is_dir) {
            setExpandedPaths((current) => {
                const next = new Set(current);
                if (next.has(path)) {
                    next.delete(path);
                } else {
                    next.add(path);
                }
                return next;
            });
        }
    };

    const selectWholeRepo = () => {
        if (!tree) return;
        const root = { ...tree, name: docSet.display_name, path: '.' };
        setSelectedPath('.');
        setExpandedPaths((current) => new Set(current).add('.'));
        toggleNodeChecked(root, true);
    };

    return (
        <>
        <div className="flex h-full flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--outline-variant)] bg-[rgba(16,16,21,0.82)] px-4 py-2 backdrop-blur-xl">
                <div className="flex min-w-0 items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                    <span className="text-sm font-bold text-[var(--on-surface)]">Map Device Paths</span>
                </div>
                <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
                <div className="mx-auto max-w-5xl space-y-4">
                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold text-[var(--on-surface)]">
                                <GitBranch className="h-4 w-4 text-[var(--primary)]" />
                                Where should this repo live on this computer?
                            </div>
                            <p className="mt-1 max-w-2xl text-xs text-[var(--on-surface-variant)]">
                                GitHub stays as the source of truth. Open Sesame keeps a mirror, then this screen lets this computer choose local folders for editing.
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
                            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--on-surface)]">Recommended setup</p>
                            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                                Select the whole repo, then choose one local folder and confirm it in the panel below.
                            </p>
                        </div>
                        <Button onClick={selectWholeRepo} disabled={loading || !tree}>
                            <FolderOpen className="h-4 w-4" />
                            Select Whole Repo
                        </Button>
                    </div>
                </div>

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-3">
                    <div className="mb-3">
                        <div>
                            <p className="text-sm font-bold text-[var(--on-surface)]">Advanced mapping</p>
                            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                                For multi-device setups: choose a folder or file from the repo, then map only that part to a local path.
                            </p>
                        </div>
                    </div>

                    <div className="grid min-h-[520px] gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                    <section className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                        <div className="flex items-center justify-between border-b border-[var(--outline-variant)] px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                                1. Choose from repo
                            </p>
                        </div>
                        <div className="max-h-[580px] overflow-auto p-2">
                            {tree ? (
                                <MappingTree
                                    node={{ ...tree, name: docSet.display_name, path: '.' }}
                                    pendingCheckedPaths={pendingCheckedPaths}
                                    mappedPaths={mappedPaths}
                                    selectedPath={selectedPath}
                                    expandedPaths={expandedPaths}
                                    onSelect={selectNode}
                                    onToggleCheck={toggleNodeChecked}
                                    disabled={loading}
                                />
                            ) : (
                                <p className="py-8 text-center text-sm text-[var(--on-surface-variant)]">
                                    Loading repo tree...
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                        <div className="border-b border-[var(--outline-variant)] px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                                2. Local paths on this device
                            </p>
                        </div>
                        <div className="space-y-3 overflow-visible p-3">
                            {selectedNode ? (
                                <SelectedMappingPanel
                                    node={selectedNode}
                                    source={selectedSource}
                                    pending={pendingCheckedPaths.has(selectedNode.path || '.')}
                                    mappedLocalPath={getEffectiveMappedPath(mappedPaths, selectedNode.path || '.')}
                                    draftLocalPath={draftLocalPaths[selectedNode.path || '.']}
                                    disabled={loading}
                                    onEnable={() => toggleNodeChecked(selectedNode, true)}
                                    onDraftPath={(path) => setDraftLocalPaths((current) => ({
                                        ...current,
                                        [selectedNode.path || '.']: path,
                                    }))}
                                    onConfirm={(localPath, action) => runPreflight(selectedNode, localPath, action)}
                                    onUpdate={async (patch) => {
                                        setLoading(true);
                                        setError('');
                                        try {
                                            const source = await ensureMirrorSource(selectedNode);
                                            await updateMapping(source, patch);
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : String(err));
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    onRemoveFromMirror={() => removeNewMirrorPath(selectedNode)}
                                />
                            ) : (
                                <p className="py-8 text-center text-sm text-[var(--on-surface-variant)]">
                                    Select a folder or file from the repo tree.
                                </p>
                            )}
                        </div>
                    </section>
                    </div>
                </div>

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-3">
                    <button
                        type="button"
                        onClick={() => setShowAddSource((value) => !value)}
                        className="flex w-full items-center justify-between text-left text-sm font-bold text-[var(--on-surface)]"
                    >
                        Add a new local folder into this repo
                        <Plus className="h-4 w-4 text-[var(--primary)]" />
                    </button>
                    {showAddSource && (
                    <div className="mt-3">
                            <p className="mb-3 text-xs text-[var(--on-surface-variant)]">
                                Import a local folder into the repo root. The chosen folder is copied into the mirror using the repo name below, then mapped back to the original local folder.
                            </p>
                            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                                <Input
                                    label="Folder name in repo root"
                                    value={alias}
                                    onChange={(event) => setAlias(event.target.value)}
                                    placeholder="operations-docs"
                                />
                                <div className="flex items-end">
                                    <Button variant="outline" onClick={browseSource}>
                                        <FolderOpen className="h-4 w-4" />
                                        Choose Folder
                                    </Button>
                                </div>
                                <div className="flex items-end">
                                    <Button onClick={addExternalSource} disabled={loading}>
                                        <Plus className="h-4 w-4" />
                                        Add To Repo
                                    </Button>
                                </div>
                            </div>
                            {sourcePath && (
                                <p className="mt-2 truncate rounded border border-[var(--outline-variant)] bg-[var(--surface-container)] px-2 py-1 text-xs text-[var(--on-surface-variant)]">
                                    {sourcePath}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {error && (
                    <p className="rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[var(--error-container)] px-3 py-2 text-sm font-semibold text-[var(--error)]">
                        {error}
                    </p>
                )}

                </div>
            </div>
        </div>
        {preflightRequest && (
            <MappingPreflightDialog
                request={preflightRequest}
                disabled={loading}
                onClose={() => setPreflightRequest(null)}
                onConfirm={() => confirmSelectedMapping(
                    preflightRequest.node,
                    preflightRequest.localPath,
                    preflightRequest.action,
                )}
            />
        )}
        </>
    );
}

export function SourceMappingModal({ docSet, isOpen, onClose }: { docSet: DocSet; isOpen: boolean; onClose: () => void }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Map Device Paths" size="xl">
            {isOpen && (
                <div className="h-[calc(100vh-9rem)]">
                    <SourceMappingPanel docSet={docSet} onClose={onClose} />
                </div>
            )}
        </Modal>
    );
}

