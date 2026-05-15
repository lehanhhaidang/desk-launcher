import { useEffect } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Hook để subscribe vào Tauri events, auto cleanup khi unmount.
 *
 * Usage:
 *   useTauriEvent(() => onSyncUpdate((e) => console.log(e)));
 */
export function useTauriEvent(subscribe: () => Promise<UnlistenFn>) {
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;

        subscribe().then((fn) => {
            unlisten = fn;
        });

        return () => {
            unlisten?.();
        };
    }, [subscribe]);
}
