import { Sidebar } from './sidebar';
import { WorkspaceContent } from '@os/features/workspace/components/workspace-content';

export function AppLayout() {
    return (
        <div className="app-bg flex h-screen overflow-hidden text-[var(--on-surface)]">
            <Sidebar className="w-14 shrink-0" />
            <WorkspaceContent />
        </div>
    );
}

