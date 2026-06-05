import { useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDownToLine, ArrowUpFromLine, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@os/components/ui';
import type { SetSourceMappingInput, SourceMappingView } from '@os/types/models';
import type { FileNode, MappingAction } from './source-mapping-types';
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
    onConfirm: (localPath: string, action: MappingAction) => Promise<void>;
    onUpdate: (patch: Partial<SetSourceMappingInput>) => Promise<void>;
    onRemoveFromMirror: () => void;
}) {
    const counts = useMemo(() => countChildren(node), [node]);
    const localPath = draftLocalPath ?? source?.mapping.local_path ?? mappedLocalPath ?? '';
    const canRemoveFromMirror = node.git_status === 'untracked';

    const browseLocal = async () => {
        const selected = await open({ directory: node.is_dir, multiple: false });
        if (typeof selected === 'string') {
            onDraftPath(selected);
        }
    };

    if (!pending && !mappedLocalPath) {
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
                        disabled={disabled}
                        className="h-8 min-w-0 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] px-3 text-sm text-[var(--on-surface)]"
                    />
                    <Button variant="outline" onClick={browseLocal} disabled={disabled}>
                        <FolderOpen className="h-4 w-4" />
                        Path
                    </Button>
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--on-surface-variant)]">
                    <input
                        type="checkbox"
                        checked={source?.mapping.enabled ?? true}
                        disabled={disabled}
                        onChange={(event) => void onUpdate({ enabled: event.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                    />
                    Enabled (sync this source)
                </label>
                {canRemoveFromMirror && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRemoveFromMirror}
                        disabled={disabled}
                        className="border-[color-mix(in_srgb,var(--error)_38%,transparent)] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]"
                    >
                        <Trash2 className="h-4 w-4" />
                        Remove From Mirror
                    </Button>
                )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button
                    onClick={() => void onConfirm(localPath, 'push')}
                    disabled={disabled || !localPath.trim()}
                >
                    <ArrowUpFromLine className="h-4 w-4" />
                    Push from local
                </Button>
                <Button
                    variant="outline"
                    onClick={() => void onConfirm(localPath, 'pull')}
                    disabled={disabled || !localPath.trim()}
                >
                    <ArrowDownToLine className="h-4 w-4" />
                    Pull from repo
                </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--on-surface-variant)]">
                <b>Push from local</b>: this device wins — local overwrites repo (repo-only files kept).{' '}
                <b>Pull from repo</b>: repo wins — repo overwrites local (local-only files kept).
            </p>
        </div>
    );
}
