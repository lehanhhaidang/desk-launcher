import { useCallback } from 'react';
import { invoke } from '@os/lib/tauri';
import { useWorkspaceStore } from '@os/stores/workspace-store';
import type { Workspace, CreateWorkspaceInput, UpdateWorkspaceInput } from '@os/types/models';

export function useWorkspaces() {
    const store = useWorkspaceStore();

    const fetchWorkspaces = useCallback(async () => {
        const data = await invoke<Workspace[]>('workspace_list');
        store.setWorkspaces(data);
        // Auto-select first if none selected
        if (!store.activeWorkspaceId && data.length > 0) {
            store.setActiveWorkspace(data[0].id);
        }
    }, []);

    const createWorkspace = useCallback(async (input: CreateWorkspaceInput) => {
        const ws = await invoke<Workspace>('workspace_create', { input });
        store.addWorkspace(ws);
        store.setActiveWorkspace(ws.id);
        return ws;
    }, []);

    const updateWorkspace = useCallback(async (id: string, input: UpdateWorkspaceInput) => {
        const ws = await invoke<Workspace>('workspace_update', { id, input });
        store.updateWorkspace(ws);
        return ws;
    }, []);

    const deleteWorkspace = useCallback(async (id: string) => {
        await invoke('workspace_delete', { id });
        store.removeWorkspace(id);
    }, []);

    return {
        workspaces: store.workspaces,
        activeWorkspaceId: store.activeWorkspaceId,
        setActiveWorkspace: store.setActiveWorkspace,
        fetchWorkspaces,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
    };
}
