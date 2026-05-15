import { create } from 'zustand';
import type { Workspace } from '@os/types/models';

interface WorkspaceState {
    workspaces: Workspace[];
    activeWorkspaceId: string | null;
    setWorkspaces: (workspaces: Workspace[]) => void;
    setActiveWorkspace: (id: string | null) => void;
    addWorkspace: (ws: Workspace) => void;
    updateWorkspace: (ws: Workspace) => void;
    removeWorkspace: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
    workspaces: [],
    activeWorkspaceId: null,
    setWorkspaces: (workspaces) => set({ workspaces }),
    setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),
    addWorkspace: (ws) =>
        set((state) => ({ workspaces: [...state.workspaces, ws] })),
    updateWorkspace: (ws) =>
        set((state) => ({
            workspaces: state.workspaces.map((w) => (w.id === ws.id ? ws : w)),
        })),
    removeWorkspace: (id) =>
        set((state) => ({
            workspaces: state.workspaces.filter((w) => w.id !== id),
            activeWorkspaceId:
                state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
        })),
}));
