import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronRight, FileText, FolderOpen, GitBranch, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { Button, Input, Modal, Select, Spinner } from '@os/components/ui';
import type {
    AddMirrorSourceInput,
    AddSourceInput,
    DocSet,
    MappingPreflight,
    MappingPreflightAction,
    MappingOverview,
    SetSourceMappingInput,
    SourceMappingView,
    SourceSyncDirection,
} from '@os/types/models';

interface FileNode {
    name: string;
    path: string;
    absolute_path: string;
    is_dir: boolean;
    git_status?: string | null;
    children: FileNode[] | null;
}

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
    const [preflightRequest, setPreflightRequest] = useState<{
        node: FileNode;
        localPath: string;
        direction: SourceSyncDirection;
        preflight: MappingPreflight;
    } | null>(null);

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

    const runPreflight = async (node: FileNode, localPath: string, direction: SourceSyncDirection) => {
        if (direction === 'mirror_only') {
            await confirmSelectedMapping(node, localPath, direction, 'map_only');
            return;
        }
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
            if (preflight.status === 'empty') {
                await confirmSelectedMapping(node, localPath, direction, 'restore_mirror');
            } else {
                setPreflightRequest({ node, localPath, direction, preflight });
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
        direction: SourceSyncDirection,
        action: MappingPreflightAction = 'map_only',
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
                    direction,
                    local_path: direction === 'mirror_only'
                        ? undefined
                        : current === node ? localPath : joinLocalPath(localPath, relative),
                });
            }
            setPendingCheckedPaths((current) => {
                const next = new Set(current);
                nodes.forEach((currentNode) => next.delete(currentNode.path || '.'));
                return next;
            });
            if (action === 'restore_mirror') {
                await invoke<number>('doc_set_restore_local_from_mirror', { docSetId: docSet.id });
            } else if (action === 'import_local') {
                await invoke<number>('doc_set_refresh_mirror', { docSetId: docSet.id });
            } else if (action === 'keep_both') {
                await invoke<number>('doc_set_keep_both_local_changes', {
                    input: {
                        doc_set_id: docSet.id,
                        mirror_path: basePath,
                        local_path: localPath,
                    },
                });
                await invoke<number>('doc_set_restore_local_from_mirror', { docSetId: docSet.id });
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
                                <TreeRow
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
                                    onConfirm={(localPath, direction) => runPreflight(selectedNode, localPath, direction)}
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
                onConfirm={(action) => confirmSelectedMapping(
                    preflightRequest.node,
                    preflightRequest.localPath,
                    preflightRequest.direction,
                    action,
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

function MappingPreflightDialog({
    request,
    disabled,
    onClose,
    onConfirm,
}: {
    request: {
        node: FileNode;
        localPath: string;
        direction: SourceSyncDirection;
        preflight: MappingPreflight;
    };
    disabled: boolean;
    onClose: () => void;
    onConfirm: (action: MappingPreflightAction) => Promise<void>;
}) {
    const { preflight, node } = request;
    const hasConflicts = preflight.conflicts > 0;
    const hasLocalOnly = preflight.only_local > 0;
    const [showHelp, setShowHelp] = useState(false);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={hasConflicts ? 'Local Files Are Different' : 'Connect Existing Local Files'}
            description="Review local files before connecting this device path to the repo mirror."
            size="2xl"
        >
            <div className="space-y-4">
                <div className={`rounded-lg border p-3 ${
                    hasConflicts
                        ? 'border-[color-mix(in_srgb,var(--error)_38%,transparent)] bg-[color-mix(in_srgb,var(--error-container)_55%,transparent)]'
                        : 'border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]'
                }`}>
                    <p className="text-sm font-bold text-[var(--on-surface)]">
                        {node.name} will be mapped to this device path.
                    </p>
                    <p className="mt-1 break-all text-xs text-[var(--on-surface-variant)]">
                        {preflight.local_path}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <PreflightStat label="Same" value={preflight.same} />
                    <PreflightStat label="Only in repo" value={preflight.only_mirror} />
                    <PreflightStat label="Only local" value={preflight.only_local} tone={hasLocalOnly ? 'warn' : undefined} />
                    <PreflightStat label="Conflicts" value={preflight.conflicts} tone={hasConflicts ? 'danger' : undefined} />
                </div>

                {preflight.samples.length > 0 && (
                    <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                        <div className="border-b border-[var(--outline-variant)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                            Files to review
                        </div>
                        <div className="max-h-44 overflow-auto p-2">
                            {preflight.samples.map((sample) => (
                                <div key={`${sample.kind}:${sample.path}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-bold ${
                                        sample.kind === 'conflict'
                                            ? 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]'
                                            : sample.kind === 'only_local'
                                                ? 'border-[color-mix(in_srgb,var(--tertiary)_45%,transparent)] text-[var(--tertiary)]'
                                                : 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-[var(--primary)]'
                                    }`}>
                                        {sample.kind === 'conflict' ? 'different' : sample.kind === 'only_local' ? 'local' : 'repo'}
                                    </span>
                                    <span className="min-w-0 truncate text-[var(--on-surface)]">{sample.path}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-3 text-xs text-[var(--on-surface-variant)]">
                    {hasConflicts
                        ? 'Some files exist in both places but have different content. Choose a direction explicitly so Open Sesame does not overwrite anything by surprise.'
                        : 'This local path already has files. Choose whether the repo should fill this folder, or this folder should become local changes waiting to push.'}
                </div>

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                    <button
                        type="button"
                        onClick={() => setShowHelp((v) => !v)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
                    >
                        What does each option do?
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showHelp ? 'rotate-90' : ''}`} />
                    </button>
                    {showHelp && (
                        <div className="border-t border-[var(--outline-variant)] p-3">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="text-left text-[var(--on-surface)]">
                                        <th className="border-b border-[var(--outline-variant)] pb-2 pr-3 font-bold">Option</th>
                                        <th className="border-b border-[var(--outline-variant)] pb-2 font-bold">What happens</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[var(--on-surface-variant)]">
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Map Only</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Only records the mapping. No files are copied or overwritten. Sync starts from the next push/pull.</td>
                                    </tr>
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Import Local</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Copies local files into the mirror. Your local folder becomes the source of truth — changes are treated as pending commits waiting to be pushed.</td>
                                    </tr>
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Keep Both</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Merges files from both sides — nothing is deleted. Both local and mirror end up with the union of all files.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Use Repo Mirror</td>
                                        <td className="py-2">Overwrites local files with the repo mirror content. The repo is the source of truth — local-only files are kept but conflicts are replaced.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={disabled}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('map_only')} disabled={disabled}>
                        Map Only
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('import_local')} disabled={disabled}>
                        Import Local
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('keep_both')} disabled={disabled}>
                        Keep Both
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('restore_mirror')} disabled={disabled}>
                        Use Repo Mirror
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function PreflightStat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
    const toneClass = tone === 'danger'
        ? 'text-[var(--error)]'
        : tone === 'warn'
            ? 'text-[var(--tertiary)]'
            : 'text-[var(--primary)]';
    return (
        <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2">
            <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
        </div>
    );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(message)), ms);
        promise
            .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                window.clearTimeout(timer);
                reject(err);
            });
    });
}

function TreeRow({
    node,
    pendingCheckedPaths,
    mappedPaths,
    selectedPath,
    expandedPaths,
    onSelect,
    onToggleCheck,
    disabled,
    depth = 0,
}: {
    node: FileNode;
    pendingCheckedPaths: Set<string>;
    mappedPaths: Map<string, string>;
    selectedPath: string;
    expandedPaths: Set<string>;
    onSelect: (node: FileNode) => void;
    onToggleCheck: (node: FileNode, checked: boolean) => void;
    disabled: boolean;
    depth?: number;
}) {
    const mirrorPath = node.path || '.';
    const descendants = collectNodes(node);
    const checkedCount = descendants.filter((child) => pendingCheckedPaths.has(child.path || '.')).length;
    const checked = checkedCount === descendants.length && descendants.length > 0;
    const partial = checkedCount > 0 && !checked;
    const mappedLocalPath = getEffectiveMappedPath(mappedPaths, mirrorPath);
    const expanded = expandedPaths.has(mirrorPath);
    const selected = selectedPath === mirrorPath;
    const changeTone = getChangeTone(node.git_status);

    return (
        <div>
            <div
                className={`group flex min-h-10 items-center gap-2 rounded-md px-2 py-1 text-sm text-[var(--on-surface)] hover:bg-[rgba(255,255,255,0.045)] ${
                    selected ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]' : ''
                } ${changeTone?.rowClass || ''}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => onSelect(node)}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => {
                        event.stopPropagation();
                        onToggleCheck(node, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                    title={partial ? 'Some children are included' : undefined}
                />
                {node.is_dir && (
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                )}
                {node.is_dir ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-[var(--tertiary)]" />
                ) : (
                    <FileText className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                )}
                <span className="min-w-0 flex-1">
                    <span className={`block truncate ${changeTone?.textClass || ''}`}>{node.name}</span>
                    {mappedLocalPath && (
                        <span className="block truncate text-[11px] font-medium text-[var(--on-surface-variant)] opacity-75">
                            {mappedLocalPath}
                        </span>
                    )}
                </span>
                {partial && (
                    <span className="rounded-md border border-[var(--outline-variant)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-surface-variant)]">
                        partial
                    </span>
                )}
                {changeTone && (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${changeTone.badgeClass}`}>
                        {changeTone.label}
                    </span>
                )}
                {mappedLocalPath && (
                    <span className="rounded-md border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">
                        mapped
                    </span>
                )}
            </div>
            {expanded && node.children?.map((child) => (
                <TreeRow
                    key={child.absolute_path}
                    node={child}
                    pendingCheckedPaths={pendingCheckedPaths}
                    mappedPaths={mappedPaths}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    onSelect={onSelect}
                    onToggleCheck={onToggleCheck}
                    disabled={disabled}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
}

function getChangeTone(status?: string | null) {
    switch (status) {
        case 'untracked':
            return {
                label: 'new',
                rowClass: 'bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]',
                textClass: 'text-[var(--primary)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--primary)_35%,transparent)] text-[var(--primary)]',
            };
        case 'modified':
        case 'renamed':
            return {
                label: status === 'renamed' ? 'renamed' : 'modified',
                rowClass: 'bg-[color-mix(in_srgb,var(--tertiary)_7%,transparent)]',
                textClass: 'text-[var(--tertiary)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--tertiary)_40%,transparent)] text-[var(--tertiary)]',
            };
        case 'deleted':
        case 'conflicted':
            return {
                label: status,
                rowClass: 'bg-[color-mix(in_srgb,var(--error)_7%,transparent)]',
                textClass: 'text-[var(--error)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--error)_42%,transparent)] text-[var(--error)]',
            };
        default:
            return null;
    }
}

function SelectedMappingPanel({
    node,
    source,
    pending,
    mappedLocalPath,
    draftLocalPath,
    disabled,
    onEnable,
    onDraftPath,
    onConfirm,
    onUpdate,
    onRemoveFromMirror,
}: {
    node: FileNode;
    source?: SourceMappingView;
    pending: boolean;
    mappedLocalPath?: string;
    draftLocalPath?: string;
    disabled: boolean;
    onEnable: () => void;
    onDraftPath: (path: string) => void;
    onConfirm: (localPath: string, direction: SourceSyncDirection) => Promise<void>;
    onUpdate: (patch: Partial<SetSourceMappingInput>) => Promise<void>;
    onRemoveFromMirror: () => void;
}) {
    const counts = useMemo(() => countChildren(node), [node]);
    const localPath = draftLocalPath ?? source?.mapping.local_path ?? mappedLocalPath ?? '';
    const direction = source?.mapping.direction || 'two_way';
    const requiresLocalPath = direction !== 'mirror_only';
    const canRemoveFromMirror = node.git_status === 'untracked';

    const browseLocal = async () => {
        const selected = await open({ directory: node.is_dir, multiple: false });
        if (typeof selected === 'string') {
            onDraftPath(selected);
        }
    };

    if (!pending && !mappedLocalPath && direction !== 'mirror_only') {
        return (
            <div className="p-1">
                <p className="text-sm font-bold text-[var(--on-surface)]">{node.name}</p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                    This {node.is_dir ? 'folder' : 'file'} is not mapped on this device yet. Check it on the left or use the button below to configure it.
                </p>
                {node.is_dir && (
                    <p className="mt-3 rounded border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] px-3 py-2 text-xs text-[var(--on-surface-variant)]">
                        Contains {counts.folders} folder{counts.folders === 1 ? '' : 's'} and {counts.files} file{counts.files === 1 ? '' : 's'} in the visible tree.
                    </p>
                )}
                <Button className="mt-4" size="sm" onClick={() => void onEnable()} disabled={disabled}>
                    Configure This {node.is_dir ? 'Folder' : 'File'}
                </Button>
            </div>
        );
    }

    const statusClass =
        source?.severity === 'blocked'
            ? 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]'
            : source?.severity === 'info'
                ? 'border-[var(--outline-variant)] text-[var(--on-surface-variant)]'
                : 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-[var(--primary)]';

    return (
        <div className="p-1">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--on-surface)]">{node.name}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--on-surface-variant)]">
                        repo: {(node.path || '.') === '.' ? 'root' : node.path}
                    </p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-bold ${statusClass}`}>
                    {source?.status.replace(/_/g, ' ') || 'included'}
                </span>
            </div>

            {node.is_dir && (
                <p className="mt-3 rounded border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] px-3 py-2 text-xs text-[var(--on-surface-variant)]">
                    This selected folder includes {counts.folders} folder{counts.folders === 1 ? '' : 's'} and {counts.files} file{counts.files === 1 ? '' : 's'} in the visible tree.
                </p>
            )}

            <div className="mt-3 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                    Local path on this device
                </label>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                    value={localPath}
                    onChange={(event) => onDraftPath(event.target.value)}
                    placeholder={node.is_dir ? 'Choose a local folder...' : 'Choose a local file path...'}
                    disabled={disabled || !requiresLocalPath}
                    className="h-8 min-w-0 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] px-3 text-sm text-[var(--on-surface)]"
                />
                <Button variant="outline" onClick={browseLocal} disabled={disabled || !requiresLocalPath}>
                    <FolderOpen className="h-4 w-4" />
                    Path
                </Button>
                </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                        Sync mode
                    </label>
                    <Select
                        value={direction}
                        disabled={disabled}
                        onChange={(value) => {
                            if (value === 'mirror_only') {
                                void onUpdate({ local_path: undefined, direction: value, enabled: true });
                                return;
                            }
                            void onUpdate({ direction: value });
                        }}
                        options={[
                            { value: 'two_way', label: 'Two-way' },
                            { value: 'local_to_mirror', label: 'Local to mirror' },
                            { value: 'mirror_to_local', label: 'Mirror to local' },
                            { value: 'mirror_only', label: 'Keep in mirror only' },
                        ]}
                        className="w-full"
                    />
                    <p className="text-xs text-[var(--on-surface-variant)]">
                        {direction === 'mirror_only'
                            ? 'This item stays in the repo mirror on this device and will not sync to a local path.'
                            : 'Files will sync between the repo mirror and the local path above using this mode.'}
                    </p>
                </div>
                <div className="flex items-end justify-start md:justify-end">
                    <label className="flex h-8 items-center gap-1.5 text-xs font-bold text-[var(--on-surface-variant)]">
                    <input
                        type="checkbox"
                        checked={source?.mapping.enabled ?? true}
                        disabled={disabled}
                        onChange={(event) => void onUpdate({ enabled: event.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                    />
                    Enabled
                </label>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                    onClick={() => void onConfirm(localPath, direction)}
                    disabled={disabled || (requiresLocalPath && !localPath.trim())}
                >
                    {mappedLocalPath ? 'Update Mapping' : 'Confirm Mapping'}
                </Button>
                {canRemoveFromMirror && (
                    <Button
                        variant="outline"
                        onClick={onRemoveFromMirror}
                        disabled={disabled}
                        className="border-[color-mix(in_srgb,var(--error)_38%,transparent)] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]"
                    >
                        <Trash2 className="h-4 w-4" />
                        Remove From Mirror
                    </Button>
                )}
            </div>
        </div>
    );
}

function collectNodes(node: FileNode): FileNode[] {
    return [node, ...(node.children || []).flatMap(collectNodes)];
}

function findNode(node: FileNode, path: string): FileNode | null {
    if ((node.path || '.') === path) return node;
    for (const child of node.children || []) {
        const found = findNode(child, path);
        if (found) return found;
    }
    return null;
}

function countChildren(node: FileNode) {
    const nodes = collectNodes(node).slice(1);
    return {
        folders: nodes.filter((child) => child.is_dir).length,
        files: nodes.filter((child) => !child.is_dir).length,
    };
}

function relativeMirrorPath(basePath: string, childPath: string) {
    if (basePath === '.' || basePath === '') return childPath === '.' ? '' : childPath;
    if (childPath === basePath) return '';
    return childPath.startsWith(`${basePath}/`) ? childPath.slice(basePath.length + 1) : childPath;
}

function joinLocalPath(basePath: string, mirrorPath: string) {
    if (mirrorPath === '.' || !mirrorPath) return basePath;
    const separator = basePath.includes('\\') ? '\\' : '/';
    const cleanBase = basePath.replace(/[\\/]+$/, '');
    const cleanMirror = mirrorPath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, separator);
    return `${cleanBase}${separator}${cleanMirror}`;
}

function getEffectiveMappedPath(mappedPaths: Map<string, string>, mirrorPath: string) {
    const normalized = mirrorPath || '.';
    const direct = mappedPaths.get(normalized);
    if (direct) return direct;

    const parts = normalized === '.' ? [] : normalized.split('/');
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const parentPath = index === 0 ? '.' : parts.slice(0, index).join('/');
        const parentLocalPath = mappedPaths.get(parentPath);
        if (parentLocalPath) {
            return joinLocalPath(parentLocalPath, parts.slice(index).join('/'));
        }
    }

    return undefined;
}
