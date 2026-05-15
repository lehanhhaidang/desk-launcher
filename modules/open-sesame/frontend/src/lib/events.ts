import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface SyncUpdateEvent {
    doc_set_id: string;
    status: 'started' | 'completed' | 'failed';
    message?: string;
    files_count?: number;
}

export interface FileChangeEvent {
    doc_set_id: string;
    origin?: 'local' | 'mirror' | 'unknown';
    changed_files: string[];
}

export interface WatcherEvent {
    doc_set_id: string;
    status: 'started' | 'stopped' | 'error';
}

export function onSyncUpdate(cb: (e: SyncUpdateEvent) => void): Promise<UnlistenFn> {
    return listen<SyncUpdateEvent>('sync:update', (event) => cb(event.payload));
}

export function onFileChange(cb: (e: FileChangeEvent) => void): Promise<UnlistenFn> {
    return listen<FileChangeEvent>('fs:change', (event) => cb(event.payload));
}

export function onWatcherStatus(cb: (e: WatcherEvent) => void): Promise<UnlistenFn> {
    return listen<WatcherEvent>('watcher:status', (event) => cb(event.payload));
}
