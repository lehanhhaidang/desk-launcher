import { useCallback } from 'react';
import { invoke } from '@os/lib/tauri';
import { useDocSetStore } from '@os/stores/doc-set-store';
import type { DocSet, CreateDocSetInput } from '@os/types/models';

export function useDocSets(workspaceId: string | null) {
    const docSets = useDocSetStore((s) => s.docSets);

    const fetchDocSets = useCallback(async () => {
        if (!workspaceId) return;
        const data = await invoke<DocSet[]>('doc_set_list', { workspaceId });
        useDocSetStore.getState().setDocSets(data);
    }, [workspaceId]);

    const createDocSet = useCallback(async (input: CreateDocSetInput) => {
        const ds = await invoke<DocSet>('doc_set_create', { input });
        useDocSetStore.getState().addDocSet(ds);
        return ds;
    }, []);

    const deleteDocSet = useCallback(async (id: string) => {
        await invoke('doc_set_delete', { id });
        useDocSetStore.getState().removeDocSet(id);
    }, []);

    return {
        docSets,
        fetchDocSets,
        createDocSet,
        deleteDocSet,
    };
}
