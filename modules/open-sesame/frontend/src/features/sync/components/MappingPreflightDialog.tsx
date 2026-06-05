import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@os/components/ui';
import type { MappingPreflightRequest } from './source-mapping-types';

type Tone = 'danger' | 'add' | 'safe';

/**
 * Directional impact preview before a Push/Pull reconcile. Shows, for the
 * chosen action, exactly which files get overwritten, added, or kept — so the
 * user sees what overwrites what before confirming. Nothing is ever deleted.
 */
export function MappingPreflightDialog({
    request,
    disabled,
    onClose,
    onConfirm,
}: {
    request: MappingPreflightRequest;
    disabled: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const { preflight, node, action } = request;
    const isPull = action === 'pull';

    const overwriteCount = preflight.conflicts;
    const addCount = isPull ? preflight.only_mirror : preflight.only_local;
    const keepCount = isPull ? preflight.only_local : preflight.only_mirror;

    const overwriteLabel = isPull ? 'repo overwrites local' : 'local overwrites repo';
    const addLabel = isPull ? 'added to local from repo' : 'added to repo from local';
    const keepLabel = isPull ? 'local-only → kept' : 'repo-only → kept';

    const affected = preflight.conflicts + preflight.only_local + preflight.only_mirror;
    const more = affected - preflight.samples.length;

    const sampleBadge = (kind: string): { text: string; tone: Tone } => {
        if (kind === 'conflict') return { text: overwriteLabel, tone: 'danger' };
        if (kind === 'only_local') {
            return isPull ? { text: 'kept (local only)', tone: 'safe' } : { text: 'add to repo', tone: 'add' };
        }
        // only_mirror
        return isPull ? { text: 'add to local', tone: 'add' } : { text: 'kept (repo only)', tone: 'safe' };
    };

    return (
        <Dialog open onOpenChange={(o) => { if (!o && !disabled) onClose(); }}>
            <DialogContent showCloseButton={!disabled} className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isPull ? '⬇ Pull from repo' : '⬆ Push from local'}
                    </DialogTitle>
                    <DialogDescription className="break-all">
                        {node.name} ↔ {preflight.local_path}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-2">
                    <Stat label="Overwrite" value={overwriteCount} hint={overwriteLabel} tone={overwriteCount ? 'danger' : undefined} />
                    <Stat label="Add" value={addCount} hint={addLabel} tone={addCount ? 'add' : undefined} />
                    <Stat label="Keep" value={keepCount} hint={keepLabel} />
                </div>

                {preflight.samples.length > 0 && (
                    <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                        <div className="border-b border-[var(--outline-variant)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                            Affected files
                        </div>
                        <div className="max-h-56 overflow-auto p-2">
                            {preflight.samples.map((sample) => {
                                const badge = sampleBadge(sample.kind);
                                return (
                                    <div key={`${sample.kind}:${sample.path}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                                        <span className={`shrink-0 rounded border px-1.5 py-0.5 font-bold ${toneBadge(badge.tone)}`}>
                                            {badge.text}
                                        </span>
                                        <span className="min-w-0 truncate text-[var(--on-surface)]">{sample.path}</span>
                                    </div>
                                );
                            })}
                            {more > 0 && (
                                <p className="px-2 py-1 text-xs text-[var(--on-surface-variant)]">+{more} more files…</p>
                            )}
                        </div>
                    </div>
                )}

                <p className="text-xs text-[var(--on-surface-variant)]">
                    {isPull
                        ? 'Repo wins: differing files are overwritten by the repo version. No local file is deleted.'
                        : 'Local wins: differing files overwrite the repo version. No repo file is deleted.'}
                </p>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={disabled}>
                        Cancel
                    </Button>
                    <Button onClick={() => void onConfirm()} disabled={disabled}>
                        {isPull ? 'Pull from repo' : 'Push from local'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function toneBadge(tone: Tone): string {
    if (tone === 'danger') return 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]';
    if (tone === 'add') return 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-[var(--primary)]';
    return 'border-[var(--outline-variant)] text-[var(--on-surface-variant)]';
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'danger' | 'add' }) {
    const toneClass = tone === 'danger' ? 'text-[var(--error)]' : tone === 'add' ? 'text-[var(--primary)]' : 'text-[var(--on-surface-variant)]';
    return (
        <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2">
            <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
            <p className="mt-0.5 text-[10px] text-[var(--on-surface-variant)]">{hint}</p>
        </div>
    );
}
