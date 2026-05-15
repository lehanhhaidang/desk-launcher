import type { Workspace } from '@os/types/models';

interface WorkspaceListProps {
    workspaces: Workspace[];
    activeId: string | null;
    onSelect: (id: string) => void;
}

export function WorkspaceList({ workspaces, activeId, onSelect }: WorkspaceListProps) {
    if (workspaces.length === 0) {
        return (
            <div className="p-4 text-sm text-gray-500">
                No workspaces yet
            </div>
        );
    }

    return (
        <div className="py-2">
            {workspaces.map((workspace) => (
                <div
                    key={workspace.id}
                    onClick={() => onSelect(workspace.id)}
                    className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm ${activeId === workspace.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    <span>{workspace.icon || '📁'}</span>
                    <span className="truncate">{workspace.name}</span>
                </div>
            ))}
        </div>
    );
}
