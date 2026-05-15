import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@os/lib/tauri';
import { onSyncUpdate, type SyncUpdateEvent } from '@os/lib/events';

export interface SyncResult {
    success: boolean;
    commit_hash: string | null;
    files_count: number;
    message: string;
    issue: SyncIssue | null;
}

export interface SyncIssue {
    kind: string;
    message: string;
    details: string | null;
    recoverable: boolean;
    actions: string[];
}

export function useSync(docSetId: string) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastResult, setLastResult] = useState<SyncResult | null>(null);
    const [syncStatus, setSyncStatus] = useState<string>('unknown');

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        onSyncUpdate((event: SyncUpdateEvent) => {
            if (event.doc_set_id !== docSetId) return;
            if (event.status === 'started') setIsSyncing(true);
            if (event.status === 'completed' || event.status === 'failed') {
                setIsSyncing(false);
                refreshStatus();
            }
        }).then((fn) => {
            unlisten = fn;
        });
        return () => {
            unlisten?.();
        };
    }, [docSetId]);

    const syncUp = useCallback(
        async (message?: string) => {
            setIsSyncing(true);
            try {
                const result = await invoke<SyncResult>('sync_up', { docSetId, message });
                setLastResult(result);
                return result;
            } finally {
                setIsSyncing(false);
            }
        },
        [docSetId],
    );

    const syncDown = useCallback(async () => {
        setIsSyncing(true);
        try {
            const result = await invoke<SyncResult>('sync_down', { docSetId });
            setLastResult(result);
            return result;
        } finally {
            setIsSyncing(false);
        }
    }, [docSetId]);

    const forcePush = useCallback(
        async (message?: string) => {
            setIsSyncing(true);
            try {
                const result = await invoke<SyncResult>('sync_force_push', { docSetId, message });
                setLastResult(result);
                return result;
            } finally {
                setIsSyncing(false);
            }
        },
        [docSetId],
    );

    const forcePull = useCallback(async () => {
        setIsSyncing(true);
        try {
            const result = await invoke<SyncResult>('sync_force_pull', { docSetId });
            setLastResult(result);
            return result;
        } finally {
            setIsSyncing(false);
        }
    }, [docSetId]);

    const refreshStatus = useCallback(async () => {
        try {
            const status = await invoke<string>('sync_status', { docSetId });
            setSyncStatus(status);
        } catch {
            setSyncStatus('error');
        }
    }, [docSetId]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    return { isSyncing, lastResult, syncStatus, syncUp, syncDown, forcePush, forcePull, refreshStatus };
}
