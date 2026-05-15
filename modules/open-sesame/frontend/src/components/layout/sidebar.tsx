import { useEffect, useState } from 'react';
import { useWorkspaces } from '@os/features/workspace/hooks/use-workspaces';
import { WorkspaceForm } from '@os/features/workspace/components/workspace-form';
import { useAuthStore } from '@os/stores/auth-store';
import { useAuth } from '@os/features/auth/hooks/use-auth';
import { HelpModal } from '@os/features/help/components/help-modal';
import { BookOpen, Building2, Folder, GitBranch, LogOut, Plus, Settings, UserRound, Users } from 'lucide-react';

export function Sidebar({ className }: { className?: string }) {
    const { workspaces, activeWorkspaceId, setActiveWorkspace, fetchWorkspaces, createWorkspace } =
        useWorkspaces();
    const accounts = useAuthStore((s) => s.accounts);
    const { logout } = useAuth();
    const [showForm, setShowForm] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const account = accounts[0];
    const fallbackIcons = [Folder, Users, Building2];

    return (
        <aside className={`flex h-full flex-col items-center border-r border-[var(--outline-variant)] bg-[rgba(9,10,16,0.76)] py-4 shadow-[12px_0_36px_rgba(0,0,0,0.16)] backdrop-blur-xl ${className}`}>
            <button
                onClick={() => setActiveWorkspace(null)}
                className="lux-gradient mb-6 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-[#071413] shadow-[0_10px_24px_rgba(124,238,230,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(183,156,255,0.25)]"
                title="All Workspaces"
            >
                OS
            </button>

            <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto">
                {workspaces.map((workspace, index) => {
                    const Icon = fallbackIcons[index % fallbackIcons.length];
                    const isActive = activeWorkspaceId === workspace.id;
                    return (
                        <button
                            key={workspace.id}
                            onClick={() => setActiveWorkspace(workspace.id)}
                            className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ease-out ${
                                isActive
                                    ? 'bg-[rgba(183,156,255,0.16)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(183,156,255,0.2)]'
                                    : 'text-[color-mix(in_srgb,var(--on-surface-variant)_62%,transparent)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)] hover:-translate-y-0.5'
                            }`}
                            title={workspace.name}
                        >
                            {isActive && <span className="absolute left-0 h-6 w-0.5 rounded-r bg-[var(--primary)]" />}
                            {workspace.icon ? <span className="text-base">{workspace.icon}</span> : <Icon className="h-5 w-5" />}
                        </button>
                    );
                })}

                <button
                    onClick={() => setShowForm(true)}
                    className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(183,156,255,0.48)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--primary)]"
                    title="Create workspace"
                >
                    <Plus className="h-5 w-5" />
                </button>
            </div>

            <div className="mt-auto flex w-full flex-col items-center gap-2">
                <button
                    onClick={() => setShowHelp(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[color-mix(in_srgb,var(--on-surface-variant)_62%,transparent)] transition-all duration-200 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)]"
                    title="Guide book"
                >
                    <BookOpen className="h-5 w-5" />
                </button>

                <button
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[color-mix(in_srgb,var(--on-surface-variant)_62%,transparent)] transition-all duration-200 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)]"
                    title="Settings"
                >
                    <Settings className="h-5 w-5" />
                </button>

                {account && (
                    <>
                        <button
                            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md text-[var(--on-surface-variant)]"
                            title={account.username}
                        >
                            {account.avatar_url ? (
                                <img src={account.avatar_url} alt={account.username} className="h-7 w-7 rounded-full border border-[var(--outline-variant)]" />
                            ) : (
                                <UserRound className="h-5 w-5" />
                            )}
                        </button>
                        <button
                            onClick={() => logout(account.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-[color-mix(in_srgb,var(--on-surface-variant)_62%,transparent)] transition-all duration-200 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--error)]"
                            title="Sign out"
                        >
                            <LogOut className="h-5 w-5" />
                        </button>
                    </>
                )}

                {!account && <GitBranch className="h-5 w-5 text-[var(--on-surface-variant)]" />}
            </div>

            <WorkspaceForm
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={createWorkspace}
            />
            <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
        </aside>
    );
}

