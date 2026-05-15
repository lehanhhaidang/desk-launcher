import { useEffect, useState, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FileTree, type FileNode } from './file-tree';
import { MarkdownPreview } from './markdown-preview';
import { SearchBar } from './search-bar';
import { SyncControls } from '@os/features/sync/components/sync-controls';
import { SourceMappingPanel } from '@os/features/sync/components/source-mapping-modal';
import { SyncHistory } from '@os/features/sync/components/sync-history';
import { PanelLeftClose, PanelLeft, History, RefreshCw } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { onFileChange, onSyncUpdate, type FileChangeEvent, type SyncUpdateEvent } from '@os/lib/events';
import type { DocSet } from '@os/types/models';

interface ExplorerLayoutProps {
    docSet: DocSet;
    onDocSetUpdated: (docSet: DocSet) => void;
    initialShowMapping?: boolean;
}

export function ExplorerLayout({ docSet, onDocSetUpdated, initialShowMapping }: ExplorerLayoutProps) {
    const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const stored = Number(window.localStorage.getItem('open-sesame:files-sidebar-width'));
        return Number.isFinite(stored) && stored >= 220 && stored <= 560 ? stored : 272;
    });
    const [showHistory, setShowHistory] = useState(false);
    const [showMapping, setShowMapping] = useState(!!initialShowMapping);
    const [filesRefreshKey, setFilesRefreshKey] = useState(0);
    const { id: docSetId } = docSet;
    const sourcePath = docSet.mirror_path || docSet.source_path;

    const refreshFiles = useCallback(() => {
        setFilesRefreshKey((key) => key + 1);
    }, []);

    const refreshMirrorAndFiles = useCallback(async () => {
        try {
            await invoke<number>('doc_set_refresh_mirror', { docSetId });
        } finally {
            refreshFiles();
        }
    }, [docSetId, refreshFiles]);

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        onSyncUpdate((event: SyncUpdateEvent) => {
            if (event.doc_set_id === docSetId && event.status === 'completed') {
                refreshFiles();
            }
        }).then((fn) => {
            unlisten = fn;
        });
        return () => unlisten?.();
    }, [docSetId, refreshFiles]);

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let debounceTimer: number | null = null;
        let disposed = false;

        invoke('doc_set_watch_start', { docSetId }).catch(() => {
            // Manual refresh still works if the OS watcher cannot be started.
        });

        onFileChange((event: FileChangeEvent) => {
            if (event.doc_set_id !== docSetId) return;
            if (debounceTimer) window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                if (disposed) return;
                if (event.origin === 'local') {
                    void refreshMirrorAndFiles();
                } else {
                    refreshFiles();
                }
            }, 500);
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            disposed = true;
            if (debounceTimer) window.clearTimeout(debounceTimer);
            unlisten?.();
            void invoke('doc_set_watch_stop', { docSetId });
        };
    }, [docSetId, refreshFiles, refreshMirrorAndFiles]);

    useEffect(() => {
        setSelectedFile(null);
        refreshFiles();
    }, [sourcePath, refreshFiles]);

    const handleSelectFile = useCallback((node: FileNode) => {
        setSelectedFile(node);
    }, []);

    const handleSearchSelect = useCallback(async (filePath: string) => {
        // Create a minimal FileNode from search result
        const parts = filePath.split('/');
        const name = parts[parts.length - 1];
        try {
            // Try to load the full node info
            await invoke<FileNode>('file_tree', { sourcePath, maxDepth: 0 });
            setSelectedFile({
                name,
                path: filePath,
                absolute_path: `${sourcePath}/${filePath}`,
                is_dir: false,
                size: null,
                modified: null,
                extension: name.includes('.') ? name.split('.').pop() || null : null,
                git_status: null,
                children: null,
            });
        } catch {
            setSelectedFile({
                name,
                path: filePath,
                absolute_path: `${sourcePath}/${filePath}`,
                is_dir: false,
                size: null,
                modified: null,
                extension: name.includes('.') ? name.split('.').pop() || null : null,
                git_status: null,
                children: null,
            });
        }
    }, [sourcePath]);

    const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = sidebarWidth;
        let latestWidth = startWidth;

        const handleMove = (moveEvent: PointerEvent) => {
            const nextWidth = Math.min(560, Math.max(220, startWidth + moveEvent.clientX - startX));
            latestWidth = nextWidth;
            setSidebarWidth(nextWidth);
        };
        const handleUp = () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.localStorage.setItem('open-sesame:files-sidebar-width', String(latestWidth));
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
    }, [sidebarWidth]);

    return (
        <div className="flex h-full min-h-0 bg-[var(--background)]">
            {/* Sidebar */}
            {sidebarOpen && (
                <div
                    className="relative flex shrink-0 flex-col border-r border-[var(--outline-variant)] bg-[var(--surface-low)]"
                    style={{ width: sidebarWidth }}
                >
                    {/* Sidebar header */}
                    <div className="flex h-10 items-center justify-between border-b border-[var(--outline-variant)] px-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">Files</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => void refreshMirrorAndFiles()}
                                className="rounded p-1 text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--primary)]"
                                title="Rescan mapped local paths and refresh files"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="rounded p-1 text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--primary)]"
                                title="Hide files"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <SearchBar sourcePath={sourcePath} onSelectFile={handleSearchSelect} />

                    {/* File tree */}
                    <div className="flex-1 overflow-auto py-1">
                        <FileTree
                            sourcePath={sourcePath}
                            onSelectFile={handleSelectFile}
                            selectedPath={selectedFile?.path}
                            refreshKey={filesRefreshKey}
                        />
                    </div>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        title="Resize files panel"
                        onPointerDown={startSidebarResize}
                        className="absolute right-[-3px] top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_38%,transparent)]"
                    />
                </div>
            )}

            {/* Main content area */}
                <div className="flex min-w-0 flex-1 flex-col">
                {/* Toolbar */}
                <div className="flex h-10 items-center gap-2 border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-3">
                    {!sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="rounded p-1 text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--primary)]"
                        >
                            <PanelLeft className="w-4 h-4" />
                        </button>
                    )}

                    <SyncControls
                        docSet={docSet}
                        onDocSetUpdated={onDocSetUpdated}
                        onFilesChanged={refreshFiles}
                        onToggleMapping={() => setShowMapping((v) => !v)}
                        mappingActive={showMapping}
                    />

                    <div className="flex-1" />

                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`rounded p-1.5 text-[var(--on-surface-variant)] hover:bg-[var(--surface-bright)] hover:text-[var(--primary)] ${showHistory ? 'bg-[var(--surface-bright)] text-[var(--primary)]' : ''}`}
                        title="Sync History"
                    >
                        <History className="w-4 h-4" />
                    </button>
                </div>

                {/* Preview area */}
                <div className="flex-1 overflow-hidden flex">
                    <div className="flex-1 overflow-hidden bg-[var(--background)]">
                        {showMapping ? (
                            <SourceMappingPanel
                                docSet={docSet}
                                onClose={() => { setShowMapping(false); refreshFiles(); }}
                                onDocSetUpdated={onDocSetUpdated}
                            />
                        ) : selectedFile && !selectedFile.is_dir ? (
                            <MarkdownPreview
                                filePath={selectedFile.absolute_path}
                                fileName={selectedFile.name}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm font-medium text-[var(--on-surface-variant)]">
                                Select a file to preview
                            </div>
                        )}
                    </div>

                    {/* History panel */}
                    {showHistory && (
                        <div className="w-72 shrink-0 overflow-auto border-l border-[var(--outline-variant)] bg-[var(--surface-low)]">
                            <div className="border-b border-[var(--outline-variant)] px-3 py-2">
                                <span className="text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                                    Sync History
                                </span>
                            </div>
                            <SyncHistory docSetId={docSetId} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
