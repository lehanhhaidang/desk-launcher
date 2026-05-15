import { useEffect, useState } from 'react';
import { invoke } from '@os/lib/tauri';
import { ArrowUp, ArrowDown, AlertCircle, Check } from 'lucide-react';
import type { SyncLog } from '@os/types/models';

export function SyncHistory({ docSetId }: { docSetId: string }) {
    const [logs, setLogs] = useState<SyncLog[]>([]);

    useEffect(() => {
        invoke<SyncLog[]>('sync_logs', { docSetId, limit: 20 })
            .then(setLogs)
            .catch(console.error);
    }, [docSetId]);

    if (logs.length === 0) {
        return <p className="text-sm text-gray-500 p-4">No sync history yet</p>;
    }

    return (
        <div className="divide-y">
            {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    {log.direction === 'up' ? (
                        <ArrowUp className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                        <ArrowDown className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    {log.status === 'success' ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{log.message || log.error_msg || 'Sync'}</span>
                    <span className="text-gray-400 shrink-0">{log.files_count} files</span>
                    <time className="text-gray-400 shrink-0">{formatRelativeTime(log.created_at)}</time>
                </div>
            ))}
        </div>
    );
}

function formatRelativeTime(isoDate: string): string {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}
