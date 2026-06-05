import type { MappingPreflight } from '@os/types/models';

export interface FileNode {
    name: string;
    path: string;
    absolute_path: string;
    is_dir: boolean;
    git_status?: string | null;
    children: FileNode[] | null;
}

/** The two directional reconcile actions the mapping UI offers. */
export type MappingAction = 'push' | 'pull';

export interface MappingPreflightRequest {
    node: FileNode;
    localPath: string;
    action: MappingAction;
    preflight: MappingPreflight;
}
