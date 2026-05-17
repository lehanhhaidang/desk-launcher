import { useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Trash2 } from 'lucide-react';
import { Button, Select } from '@os/components/ui';
import type { SetSourceMappingInput, SourceMappingView, SourceSyncDirection } from '@os/types/models';
import type { FileNode } from './source-mapping-types';
import { countChildren } from './source-mapping-utils';

export function SelectedMappingPanel({
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
