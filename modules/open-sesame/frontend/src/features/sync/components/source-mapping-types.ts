import type { MappingPreflight, SourceSyncDirection } from '@os/types/models';

export interface FileNode {
    name: string;
    path: string;
    absolute_path: string;
    is_dir: boolean;
    git_status?: string | null;
    children: FileNode[] | null;
}

export interface MappingPreflightRequest {
    node: FileNode;
    localPath: string;
    direction: SourceSyncDirection;
    preflight: MappingPreflight;
}
