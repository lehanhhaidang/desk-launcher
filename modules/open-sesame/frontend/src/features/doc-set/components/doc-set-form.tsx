import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@os/lib/tauri';
import { useAuthStore } from '@os/stores/auth-store';
import { Button, Input, Modal, Spinner } from '@os/components/ui';
import { Box, FolderOpen, GitBranch, Lock } from 'lucide-react';
import type { CreateDocSetInput, DocSet, ImportGithubDocSetInput, SetupGithubRemoteInput } from '@os/types/models';

interface DetectionResponse {
    strategy: string;
    parent_repo_path: string | null;
    reason: string;
}

interface DocSetFormProps {
    isOpen: boolean;
    workspaceId: string;
    onClose: () => void;
    onCreated: (docSet: DocSet) => void;
}

type AddMode = 'local' | 'github';

export function DocSetForm({ isOpen, workspaceId, onClose, onCreated }: DocSetFormProps) {
    const [mode, setMode] = useState<AddMode>('local');
    const [name, setName] = useState('');
    const [sourcePath, setSourcePath] = useState('');
    const [remoteUrl, setRemoteUrl] = useState('');
    const [createGithubRepo, setCreateGithubRepo] = useState(false);
    const [isPrivateRepo, setIsPrivateRepo] = useState(true);
    const [strategy, setStrategy] = useState<DetectionResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const accounts = useAuthStore((s) => s.accounts);

    const reset = () => {
        setName('');
        setSourcePath('');
        setRemoteUrl('');
        setCreateGithubRepo(false);
        setIsPrivateRepo(true);
        setStrategy(null);
        setError('');
        setMode('local');
    };

    const handleBrowse = async () => {
        const selected = await open({ directory: true, multiple: false });
        if (selected) {
            const path = selected as string;
            setSourcePath(path);
            try {
                const detection = await invoke<DetectionResponse>('doc_set_detect_strategy', { sourcePath: path });
                setStrategy(detection);
                if (!name) {
                    const parts = path.replace(/\\/g, '/').split('/');
                    setName(parts[parts.length - 1] || '');
                }
            } catch (err) {
                setError(String(err));
            }
        }
    };

    const submitLocal = async () => {
        if (!name.trim()) throw new Error('Name is required');
        if (!sourcePath) throw new Error('Please select a folder');
        if (!accounts[0]) throw new Error('No account connected');

        const input: CreateDocSetInput = {
            workspace_id: workspaceId,
            account_id: accounts[0].id,
            display_name: name.trim(),
            source_path: sourcePath,
            provider_type: 'github',
        };
        const docSet = await invoke<DocSet>('doc_set_create', { input });

        if (!createGithubRepo) return docSet;

        const setupInput: SetupGithubRemoteInput = {
            doc_set_id: docSet.id,
            mode: 'create',
            repo_name: name.trim(),
            private: isPrivateRepo,
        };

        return invoke<DocSet>('doc_set_setup_github_remote', { input: setupInput });
    };

    const submitGithub = async () => {
        if (!remoteUrl.trim()) throw new Error('GitHub repository URL is required');
        if (!accounts[0]) throw new Error('No account connected');

        const input: ImportGithubDocSetInput = {
            workspace_id: workspaceId,
            account_id: accounts[0].id,
            remote_url: remoteUrl.trim(),
            display_name: name.trim() || undefined,
        };
        return invoke<DocSet>('doc_set_import_from_github', { input });
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            const docSet = mode === 'local' ? await submitLocal() : await submitGithub();
            onCreated(docSet);
            reset();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Doc Set" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-1">
                    <ModeButton active={mode === 'local'} onClick={() => setMode('local')} icon={<FolderOpen className="h-4 w-4" />} label="Local Folder" />
                    <ModeButton active={mode === 'github'} onClick={() => setMode('github')} icon={<GitBranch className="h-4 w-4" />} label="GitHub Repo" />
                </div>

                <Input
                    label="Display Name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={mode === 'local' ? 'My Documentation' : 'Leave blank to use repo metadata'}
                    autoFocus
                />

                {mode === 'local' ? (
                    <>
                        <div>
                            <label className="mb-1 block text-[13px] font-semibold text-[var(--on-surface)]">
                                Source Folder
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={sourcePath}
                                    readOnly
                                    placeholder="Select a folder..."
                                    className="h-8 min-w-0 flex-1 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] px-3 text-sm text-[var(--on-surface-variant)]"
                                />
                                <Button type="button" variant="outline" onClick={handleBrowse}>
                                    <FolderOpen className="h-4 w-4" />
                                    Browse
                                </Button>
                            </div>
                        </div>

                        {strategy && (
                            <div className="rounded border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] p-3 text-sm text-[var(--primary)]">
                                <span className="flex items-center gap-2 font-bold">
                                    <Box className="h-4 w-4" />
                                    Mirror-managed sync
                                </span>
                                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                                    Open Sesame will mirror this folder first, then open Device Paths so you can confirm how it maps on this device. {strategy.reason}
                                </p>
                            </div>
                        )}

                        <div className="space-y-2 rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] p-3">
                            <label className="flex cursor-pointer items-start gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={createGithubRepo}
                                    onChange={(event) => setCreateGithubRepo(event.target.checked)}
                                    className="mt-1 h-4 w-4 accent-[var(--primary)]"
                                />
                                <span>
                                    <span className="flex items-center gap-2 font-bold text-[var(--on-surface)]">
                                        <GitBranch className="h-4 w-4 text-[var(--primary)]" />
                                        Create GitHub repo from display name
                                    </span>
                                    <span className="mt-1 block text-xs text-[var(--on-surface-variant)]">
                                        {name.trim()
                                            ? `Open Sesame will create and link a new repo named "${name.trim()}" before opening mapping.`
                                            : 'Enter a display name first. Open Sesame will use it as the new repo name.'}
                                    </span>
                                </span>
                            </label>

                            {createGithubRepo && (
                                <label className="ml-7 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--on-surface-variant)]">
                                    <input
                                        type="checkbox"
                                        checked={isPrivateRepo}
                                        onChange={(event) => setIsPrivateRepo(event.target.checked)}
                                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                                    />
                                    <Lock className="h-3.5 w-3.5 text-[var(--primary)]" />
                                    Private repository
                                </label>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="space-y-3">
                        <Input
                            label="GitHub Repository URL"
                            value={remoteUrl}
                            onChange={(event) => setRemoteUrl(event.target.value)}
                            placeholder="https://github.com/you/docs.git"
                        />
                        <div className="rounded border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] p-3 text-sm">
                            <span className="flex items-center gap-2 font-bold text-[var(--primary)]">
                                <GitBranch className="h-4 w-4" />
                                Pull mirror first
                            </span>
                            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                                Open Sesame will pull the repo into a local mirror, then open Device Paths so you can choose where each source syncs on this machine.
                            </p>
                        </div>
                    </div>
                )}

                {error && <p className="text-sm text-[var(--error)]">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Spinner size="sm" />}
                        {loading ? 'Working' : mode === 'local' ? 'Create & Map' : 'Import & Map'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function ModeButton({
    active,
    icon,
    label,
    onClick,
}: {
    active: boolean;
    icon: ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-9 items-center justify-center gap-2 rounded-md text-sm font-bold transition-all ${
                active
                    ? 'lux-gradient text-[#071413] shadow-[0_10px_24px_rgba(183,156,255,0.14)]'
                    : 'text-[var(--on-surface-variant)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--primary)]'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}
