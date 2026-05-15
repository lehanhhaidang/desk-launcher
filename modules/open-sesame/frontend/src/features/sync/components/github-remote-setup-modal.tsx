import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, GitBranch, Lock, Plus, Unlink } from 'lucide-react';
import { invoke } from '@os/lib/tauri';
import { Button, Input, Modal, Spinner } from '@os/components/ui';
import type { DocSet, GithubRemoteMode, SetupGithubRemoteInput } from '@os/types/models';

interface GithubRemoteSetupModalProps {
    docSet: DocSet;
    isOpen: boolean;
    onClose: () => void;
    onSetup: (docSet: DocSet) => void;
}

export function GithubRemoteSetupModal({
    docSet,
    isOpen,
    onClose,
    onSetup,
}: GithubRemoteSetupModalProps) {
    const defaultRepoName = useMemo(() => slugify(docSet.display_name), [docSet.display_name]);
    const [mode, setMode] = useState<GithubRemoteMode>('create');
    const [repoName, setRepoName] = useState(defaultRepoName);
    const [remoteUrl, setRemoteUrl] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setError(null);

        const input: SetupGithubRemoteInput = {
            doc_set_id: docSet.id,
            mode,
            private: isPrivate,
            repo_name: mode === 'create' ? repoName : undefined,
            remote_url: mode === 'link' ? remoteUrl : undefined,
        };

        if (mode === 'create' && !repoName.trim()) {
            setError('Repository name is required.');
            return;
        }

        if (mode === 'link' && !remoteUrl.trim()) {
            setError('GitHub remote URL is required.');
            return;
        }

        setIsSubmitting(true);
        try {
            const updated = await invoke<DocSet>('doc_set_setup_github_remote', { input });
            onSetup(updated);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Setup GitHub Sync" size="md">
            <div className="space-y-5">
                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] p-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--on-surface)]">
                        <GitBranch className="h-4 w-4 text-[var(--primary)]" />
                        {docSet.display_name}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--on-surface-variant)]">
                        {docSet.source_path}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-1">
                    <ModeButton
                        active={mode === 'create'}
                        icon={<Plus className="h-4 w-4" />}
                        label="Create repo"
                        onClick={() => setMode('create')}
                    />
                    <ModeButton
                        active={mode === 'link'}
                        icon={<Unlink className="h-4 w-4" />}
                        label="Link repo"
                        onClick={() => setMode('link')}
                    />
                </div>

                {mode === 'create' ? (
                    <div className="space-y-3">
                        <Input
                            label="Repository Name"
                            value={repoName}
                            onChange={(event) => setRepoName(event.target.value)}
                            placeholder={defaultRepoName}
                        />
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] px-3 py-2 text-sm font-semibold text-[var(--on-surface)]">
                            <input
                                type="checkbox"
                                checked={isPrivate}
                                onChange={(event) => setIsPrivate(event.target.checked)}
                                className="h-4 w-4 accent-[var(--primary)]"
                            />
                            <Lock className="h-4 w-4 text-[var(--primary)]" />
                            Private repository
                        </label>
                    </div>
                ) : (
                    <Input
                        label="GitHub Remote URL"
                        value={remoteUrl}
                        onChange={(event) => setRemoteUrl(event.target.value)}
                        placeholder="https://github.com/you/docs.git"
                    />
                )}

                {error && (
                    <div className="rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[var(--error-container)] px-3 py-2 text-sm font-semibold text-[var(--error)]">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}
                        {isSubmitting ? 'Setting up' : 'Setup'}
                    </Button>
                </div>
            </div>
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

function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
