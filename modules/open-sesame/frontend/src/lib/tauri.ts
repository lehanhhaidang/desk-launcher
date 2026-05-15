import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { AppError } from '@os/types/errors';

export class InvokeError extends Error {
    kind: string;

    constructor(error: AppError) {
        super(error.message);
        this.kind = error.kind;
        this.name = 'InvokeError';
    }
}

// All open-sesame Rust commands live under the `open-sesame` Tauri plugin,
// so invoke calls get auto-namespaced to `plugin:open-sesame|<cmd>`.
// Pass an explicit `plugin:` prefix or include `|` to bypass.
const PLUGIN_NS = 'open-sesame';

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const namespaced = cmd.includes('|') || cmd.startsWith('plugin:')
        ? cmd
        : `plugin:${PLUGIN_NS}|${cmd}`;
    try {
        return await tauriInvoke<T>(namespaced, args);
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'kind' in error) {
            throw new InvokeError(error as AppError);
        }
        throw new Error(typeof error === 'string' ? error : 'Unknown error');
    }
}
