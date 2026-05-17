import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button, Modal } from '@os/components/ui';
import type { MappingPreflightAction } from '@os/types/models';
import type { MappingPreflightRequest } from './source-mapping-types';

export function MappingPreflightDialog({
    request,
    disabled,
    onClose,
    onConfirm,
}: {
    request: MappingPreflightRequest;
    disabled: boolean;
    onClose: () => void;
    onConfirm: (action: MappingPreflightAction) => Promise<void>;
}) {
    const { preflight, node } = request;
    const hasConflicts = preflight.conflicts > 0;
    const hasLocalOnly = preflight.only_local > 0;
    const [showHelp, setShowHelp] = useState(false);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={hasConflicts ? 'Local Files Are Different' : 'Connect Existing Local Files'}
            description="Review local files before connecting this device path to the repo mirror."
            size="2xl"
        >
            <div className="space-y-4">
                <div className={`rounded-lg border p-3 ${
                    hasConflicts
                        ? 'border-[color-mix(in_srgb,var(--error)_38%,transparent)] bg-[color-mix(in_srgb,var(--error-container)_55%,transparent)]'
                        : 'border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]'
                }`}>
                    <p className="text-sm font-bold text-[var(--on-surface)]">
                        {node.name} will be mapped to this device path.
                    </p>
                    <p className="mt-1 break-all text-xs text-[var(--on-surface-variant)]">
                        {preflight.local_path}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <PreflightStat label="Same" value={preflight.same} />
                    <PreflightStat label="Only in repo" value={preflight.only_mirror} />
                    <PreflightStat label="Only local" value={preflight.only_local} tone={hasLocalOnly ? 'warn' : undefined} />
                    <PreflightStat label="Conflicts" value={preflight.conflicts} tone={hasConflicts ? 'danger' : undefined} />
                </div>

                {preflight.samples.length > 0 && (
                    <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                        <div className="border-b border-[var(--outline-variant)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
                            Files to review
                        </div>
                        <div className="max-h-44 overflow-auto p-2">
                            {preflight.samples.map((sample) => (
                                <div key={`${sample.kind}:${sample.path}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-bold ${
                                        sample.kind === 'conflict'
                                            ? 'border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]'
                                            : sample.kind === 'only_local'
                                                ? 'border-[color-mix(in_srgb,var(--tertiary)_45%,transparent)] text-[var(--tertiary)]'
                                                : 'border-[color-mix(in_srgb,var(--primary)_40%,transparent)] text-[var(--primary)]'
                                    }`}>
                                        {sample.kind === 'conflict' ? 'different' : sample.kind === 'only_local' ? 'local' : 'repo'}
                                    </span>
                                    <span className="min-w-0 truncate text-[var(--on-surface)]">{sample.path}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)] p-3 text-xs text-[var(--on-surface-variant)]">
                    {hasConflicts
                        ? 'Some files exist in both places but have different content. Choose a direction explicitly so Open Sesame does not overwrite anything by surprise.'
                        : 'This local path already has files. Choose whether the repo should fill this folder, or this folder should become local changes waiting to push.'}
                </div>

                <div className="rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                    <button
                        type="button"
                        onClick={() => setShowHelp((v) => !v)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
                    >
                        What does each option do?
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showHelp ? 'rotate-90' : ''}`} />
                    </button>
                    {showHelp && (
                        <div className="border-t border-[var(--outline-variant)] p-3">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="text-left text-[var(--on-surface)]">
                                        <th className="border-b border-[var(--outline-variant)] pb-2 pr-3 font-bold">Option</th>
                                        <th className="border-b border-[var(--outline-variant)] pb-2 font-bold">What happens</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[var(--on-surface-variant)]">
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Map Only</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Only records the mapping. No files are copied or overwritten. Sync starts from the next push/pull.</td>
                                    </tr>
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Import Local</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Copies local files into the mirror. Your local folder becomes the source of truth - changes are treated as pending commits waiting to be pushed.</td>
                                    </tr>
                                    <tr>
                                        <td className="border-b border-[var(--outline-variant)] py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Keep Both</td>
                                        <td className="border-b border-[var(--outline-variant)] py-2">Merges files from both sides - nothing is deleted. Both local and mirror end up with the union of all files.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-3 font-semibold text-[var(--on-surface)] whitespace-nowrap">Use Repo Mirror</td>
                                        <td className="py-2">Overwrites local files with the repo mirror content. The repo is the source of truth - local-only files are kept but conflicts are replaced.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={disabled}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('map_only')} disabled={disabled}>
                        Map Only
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('import_local')} disabled={disabled}>
                        Import Local
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('keep_both')} disabled={disabled}>
                        Keep Both
                    </Button>
                    <Button variant="outline" onClick={() => void onConfirm('restore_mirror')} disabled={disabled}>
                        Use Repo Mirror
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function PreflightStat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
    const toneClass = tone === 'danger'
        ? 'text-[var(--error)]'
        : tone === 'warn'
            ? 'text-[var(--tertiary)]'
            : 'text-[var(--primary)]';
    return (
        <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2">
            <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
        </div>
    );
}
