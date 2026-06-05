import { useCallback } from 'react';
import { invoke } from '@os/lib/tauri';
import type { DocSet } from '@os/types/models';
import type { SyncResult } from './use-sync';

export interface SessionSyncProgress {
    current: number;
    total: number;
    docSetName: string;
}

export interface SessionSyncOutcome {
    total: number;
    succeeded: number;
    filesCount: number;
    failed: { name: string; message: string }[];
}

type SyncCommand = 'sync_up' | 'sync_down';

async function listRemoteDocSets(): Promise<DocSet[]> {
    const all = await invoke<DocSet[]>('doc_set_list_all');
    return all.filter((ds) => !!ds.remote_url);
}

/**
 * Session-level sync: pull/push every doc-set that has a remote, sequentially,
 * reporting progress and aggregating the outcome. Reuses the existing per-doc-set
 * `sync_up` / `sync_down` commands and does NOT touch the auto-sync feature.
 */
export function useSessionSync() {
    const countRemote = useCallback(async (): Promise<number> => {
        try {
            return (await listRemoteDocSets()).length;
        } catch {
            return 0;
        }
    }, []);

    const runAll = useCallback(
        async (
            command: SyncCommand,
            onProgress?: (p: SessionSyncProgress) => void,
        ): Promise<SessionSyncOutcome> => {
            const docSets = await listRemoteDocSets();
            const outcome: SessionSyncOutcome = {
                total: docSets.length,
                succeeded: 0,
                filesCount: 0,
                failed: [],
            };

            for (let i = 0; i < docSets.length; i++) {
                const ds = docSets[i];
                onProgress?.({ current: i + 1, total: docSets.length, docSetName: ds.display_name });
                try {
                    const result = await invoke<SyncResult>(command, { docSetId: ds.id });
                    // sync_up/sync_down return Ok with `issue` set for recoverable
                    // failures (diverged/auth/...) instead of throwing.
                    if (result.success && !result.issue) {
                        outcome.succeeded += 1;
                        outcome.filesCount += result.files_count;
                    } else {
                        outcome.failed.push({
                            name: ds.display_name,
                            message: result.issue?.message ?? result.message,
                        });
                    }
                } catch (err) {
                    outcome.failed.push({
                        name: ds.display_name,
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            return outcome;
        },
        [],
    );

    const pullAll = useCallback(
        (onProgress?: (p: SessionSyncProgress) => void) => runAll('sync_down', onProgress),
        [runAll],
    );
    const pushAll = useCallback(
        (onProgress?: (p: SessionSyncProgress) => void) => runAll('sync_up', onProgress),
        [runAll],
    );

    return { countRemote, pullAll, pushAll };
}
