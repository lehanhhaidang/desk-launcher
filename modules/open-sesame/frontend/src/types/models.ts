export type ProviderType = 'github' | 'gitlab' | 'google_drive';
export type Strategy = 'standalone' | 'mirrored';
export type DocSetStatus = 'idle' | 'syncing' | 'pending' | 'conflict' | 'error' | 'disconnected';
export type SyncDirection = 'up' | 'down';
export type GithubRemoteMode = 'create' | 'link';

export interface Workspace {
    id: string;
    name: string;
    icon: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface Account {
    id: string;
    provider: ProviderType;
    username: string;
    avatar_url: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface DocSet {
    id: string;
    workspace_id: string;
    account_id: string;
    display_name: string;
    source_path: string;
    strategy: Strategy;
    mirror_path: string | null;
    provider_type: ProviderType;
    remote_url: string | null;
    remote_id: string | null;
    branch: string;
    auto_sync: boolean;
    last_synced_at: string | null;
    last_commit: string | null;
    status: DocSetStatus;
    has_mapping: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface CreateWorkspaceInput {
    name: string;
    icon?: string;
}

export interface UpdateWorkspaceInput {
    name?: string;
    icon?: string;
    sort_order?: number;
}

export interface CreateDocSetInput {
    workspace_id: string;
    account_id: string;
    display_name: string;
    source_path: string;
    provider_type: ProviderType;
    remote_url?: string;
}

export interface SetupGithubRemoteInput {
    doc_set_id: string;
    mode: GithubRemoteMode;
    repo_name?: string;
    remote_url?: string;
    private: boolean;
}

export interface ImportGithubDocSetInput {
    workspace_id: string;
    account_id: string;
    remote_url: string;
    display_name?: string;
}

export type SourceSyncDirection = 'two_way' | 'mirror_to_local' | 'local_to_mirror' | 'mirror_only';

export interface ManifestSource {
    id: string;
    alias: string;
    kind: string;
    mirror_path: string;
}

export interface SourceMapping {
    source_id: string;
    local_path: string | null;
    enabled: boolean;
    direction: SourceSyncDirection;
}

export interface SourceMappingView {
    source: ManifestSource;
    mapping: SourceMapping;
    status: string;
    severity: string;
    message: string;
}

export interface MappingOverview {
    manifest: {
        version: number;
        doc_set_id: string;
        name: string;
        sources: ManifestSource[];
    };
    sources: SourceMappingView[];
}

export interface SetSourceMappingInput {
    doc_set_id: string;
    source_id: string;
    local_path?: string;
    enabled: boolean;
    direction: SourceSyncDirection;
}

export type MappingPreflightStatus = 'empty' | 'safe' | 'needs_decision' | 'has_conflicts';
export type MappingPreflightAction = 'restore_mirror' | 'import_local' | 'keep_both' | 'map_only';

export interface MappingPreflightSample {
    path: string;
    kind: 'only_mirror' | 'only_local' | 'conflict';
}

export interface MappingPreflight {
    status: MappingPreflightStatus;
    mirror_path: string;
    local_path: string;
    local_exists: boolean;
    local_is_empty: boolean;
    same: number;
    only_mirror: number;
    only_local: number;
    conflicts: number;
    samples: MappingPreflightSample[];
}

export interface MappingPreflightInput {
    doc_set_id: string;
    mirror_path: string;
    local_path: string;
}

export interface AddSourceInput {
    doc_set_id: string;
    source_path: string;
    alias: string;
}

export interface AddMirrorSourceInput {
    doc_set_id: string;
    mirror_path: string;
    alias?: string;
}

export interface SyncLog {
    id: string;
    doc_set_id: string;
    direction: SyncDirection;
    commit_hash: string | null;
    message: string | null;
    files_count: number;
    status: 'success' | 'conflict' | 'error';
    error_msg: string | null;
    created_at: string;
}
