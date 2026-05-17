import { ChevronRight, FileText, FolderOpen } from 'lucide-react';
import type { FileNode } from './source-mapping-types';
import { collectNodes, getEffectiveMappedPath } from './source-mapping-utils';

export function MappingTree({
    node,
    pendingCheckedPaths,
    mappedPaths,
    selectedPath,
    expandedPaths,
    onSelect,
    onToggleCheck,
    disabled,
}: {
    node: FileNode;
    pendingCheckedPaths: Set<string>;
    mappedPaths: Map<string, string>;
    selectedPath: string;
    expandedPaths: Set<string>;
    onSelect: (node: FileNode) => void;
    onToggleCheck: (node: FileNode, checked: boolean) => void;
    disabled: boolean;
}) {
    return (
        <TreeRow
            node={node}
            pendingCheckedPaths={pendingCheckedPaths}
            mappedPaths={mappedPaths}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelect={onSelect}
            onToggleCheck={onToggleCheck}
            disabled={disabled}
        />
    );
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
