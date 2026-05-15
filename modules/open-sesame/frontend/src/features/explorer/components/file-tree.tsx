import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@os/lib/tauri';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { LoadingSkeleton } from '@os/components/ui';

export interface FileNode {
    name: string;
    path: string;
    absolute_path: string;
    is_dir: boolean;
    size: number | null;
    modified: string | null;
    extension: string | null;
    git_status?: string | null;
    children: FileNode[] | null;
}

interface FileTreeProps {
    sourcePath: string;
    onSelectFile: (node: FileNode) => void;
    selectedPath?: string;
    refreshKey?: number;
}

export function FileTree({ sourcePath, onSelectFile, selectedPath, refreshKey = 0 }: FileTreeProps) {
    const [tree, setTree] = useState<FileNode | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setTree(null);
        setError(null);
        invoke<FileNode>('file_tree', { sourcePath, maxDepth: 5, includeGitStatus: true })
            .then(setTree)
            .catch((err) => setError(err.message || 'Failed to load file tree'));
    }, [sourcePath, refreshKey]);

    if (error) return <p className="p-2 text-sm text-[var(--error)]">{error}</p>;
    if (!tree) return <LoadingSkeleton />;

    return (
        <div className="select-none text-sm text-[var(--on-surface)]">
            {tree.children?.map((node) => (
                <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    onSelectFile={onSelectFile}
                    selectedPath={selectedPath}
                />
            ))}
        </div>
    );
}

function TreeNode({
    node,
    depth,
    onSelectFile,
    selectedPath,
}: {
    node: FileNode;
    depth: number;
    onSelectFile: (node: FileNode) => void;
    selectedPath?: string;
}) {
    const [expanded, setExpanded] = useState(depth < 1);
    const isSelected = selectedPath === node.path;
    const statusTone = getStatusTone(node.git_status);
    const isDeleted = node.git_status === 'deleted';

    const handleClick = useCallback(() => {
        if (node.is_dir) {
            setExpanded((prev) => !prev);
        } else if (!isDeleted) {
            onSelectFile(node);
        }
    }, [isDeleted, node, onSelectFile]);

    const iconSize = 'w-4 h-4 shrink-0';
    const fileIcon = getFileIcon(node);

    return (
        <div>
            <div
                className={`flex min-h-7 cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--surface-bright)] ${
                    isSelected ? 'bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]' : 'text-[var(--on-surface-variant)]'
                } ${statusTone?.rowClass || ''} ${isDeleted && !node.is_dir ? 'cursor-default opacity-75' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
                onClick={handleClick}
            >
                {node.is_dir ? (
                    expanded ? <ChevronDown className={iconSize} /> : <ChevronRight className={iconSize} />
                ) : (
                    <span className="w-4" />
                )}
                {node.is_dir ? (
                    expanded ? (
                        <FolderOpen className={`${iconSize} text-[var(--tertiary)]`} />
                    ) : (
                        <Folder className={`${iconSize} text-[var(--tertiary)]`} />
                    )
                ) : (
                    <File className={`${iconSize} ${fileIcon}`} />
                )}
                <span className={`min-w-0 flex-1 truncate ${statusTone?.textClass || ''} ${isDeleted ? 'line-through decoration-2' : ''}`}>
                    {node.name}
                </span>
                {statusTone && (
                    <span className={`ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none ${statusTone.badgeClass}`}>
                        {statusTone.label}
                    </span>
                )}
            </div>
            {node.is_dir && expanded && node.children?.map((child) => (
                <TreeNode
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    onSelectFile={onSelectFile}
                    selectedPath={selectedPath}
                />
            ))}
        </div>
    );
}

function getStatusTone(status?: string | null) {
    switch (status) {
        case 'untracked':
            return {
                label: 'new',
                rowClass: 'bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]',
                textClass: 'text-[var(--primary)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--primary)_35%,transparent)] text-[var(--primary)]',
            };
        case 'modified':
        case 'renamed':
            return {
                label: status === 'renamed' ? 'renamed' : 'modified',
                rowClass: 'bg-[color-mix(in_srgb,var(--tertiary)_6%,transparent)]',
                textClass: 'text-[var(--tertiary)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--tertiary)_38%,transparent)] text-[var(--tertiary)]',
            };
        case 'deleted':
            return {
                label: 'deleted',
                rowClass: 'bg-[color-mix(in_srgb,var(--error)_7%,transparent)]',
                textClass: 'text-[var(--error)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--error)_42%,transparent)] text-[var(--error)]',
            };
        case 'conflicted':
            return {
                label: 'conflict',
                rowClass: 'bg-[color-mix(in_srgb,var(--error)_9%,transparent)]',
                textClass: 'text-[var(--error)]',
                badgeClass: 'border-[color-mix(in_srgb,var(--error)_48%,transparent)] text-[var(--error)]',
            };
        default:
            return null;
    }
}

function getFileIcon(node: FileNode): string {
    if (node.is_dir) return 'text-amber-500';
    switch (node.extension) {
        case 'md': return 'text-[var(--primary)]';
        case 'ts': case 'tsx': return 'text-sky-400';
        case 'js': case 'jsx': return 'text-yellow-400';
        case 'rs': return 'text-orange-400';
        case 'json': return 'text-emerald-400';
        case 'css': return 'text-purple-400';
        case 'html': return 'text-red-400';
        default: return 'text-[var(--on-surface-variant)]';
    }
}
