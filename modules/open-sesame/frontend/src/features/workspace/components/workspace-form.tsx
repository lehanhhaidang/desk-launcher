import { useState } from 'react';
import { Input, Button, Modal, Spinner } from '@os/components/ui';
import type { CreateWorkspaceInput } from '@os/types/models';

interface WorkspaceFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (input: CreateWorkspaceInput) => Promise<unknown>;
    initialValues?: {
        name: string;
        icon?: string;
    };
    title?: string;
}

const PRESET_ICONS = ['📁', '💼', '🏢', '📝', '🎯', '🚀', '💡', '🔬', '📊', '🎨', '🛠️', '📦', '🌟', '🎓', '❤️', '🔥'];

export function WorkspaceForm({ isOpen, onClose, onSubmit, initialValues, title }: WorkspaceFormProps) {
    const [name, setName] = useState(initialValues?.name || '');
    const [icon, setIcon] = useState(initialValues?.icon || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await onSubmit({
                name: name.trim(),
                icon: icon.trim() || undefined,
            });
            setName('');
            setIcon('');
            onClose();
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title || 'Create Workspace'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Workspace"
                    error={error}
                    autoFocus
                />

                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--on-surface-variant)]">Icon</label>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {PRESET_ICONS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => setIcon(emoji)}
                                className={`flex h-8 w-8 items-center justify-center rounded-md text-base transition-all ${
                                    icon === emoji
                                        ? 'bg-[rgba(183,156,255,0.2)] ring-1 ring-[rgba(183,156,255,0.5)]'
                                        : 'bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]'
                                }`}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    <Input
                        value={icon}
                        onChange={(e) => setIcon(e.target.value)}
                        placeholder="or type custom emoji..."
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Spinner size="sm" />}
                        {loading ? 'Creating' : 'Create'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
