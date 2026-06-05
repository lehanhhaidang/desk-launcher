import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
    AlertCircle,
    ArrowDownToLine,
    ArrowUpFromLine,
    CheckCircle2,
    Loader2,
} from 'lucide-react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@os/components/ui';
import {
    useSessionSync,
    type SessionSyncOutcome,
    type SessionSyncProgress,
} from '@os/features/sync/hooks/use-session-sync';

type PullStage = 'ask' | 'running' | 'done';
type CloseStage = null | 'confirm' | 'pushing' | 'success' | 'fail';

const CLOSE_COUNTDOWN = 3;

/**
 * Session sync UX:
 *  - On open: ask to PULL the latest from every remote doc-set.
 *  - On window close: intercept, ask to PUSH; show a polished loading state,
 *    a success report with a countdown before auto-closing, and on failure
 *    keep the window open (with a manual "close without push" escape).
 * Auto-sync is untouched.
 */
export function SessionSyncGate({ children }: { children: ReactNode }) {
    const { countRemote, pullAll, pushAll } = useSessionSync();

    // ---------- Pull on open ----------
    const [pullOpen, setPullOpen] = useState(false);
    const [pullStage, setPullStage] = useState<PullStage>('ask');
    const [pullProgress, setPullProgress] = useState<SessionSyncProgress | null>(null);
    const [pullOutcome, setPullOutcome] = useState<SessionSyncOutcome | null>(null);

    useEffect(() => {
        let cancelled = false;
        void countRemote().then((n) => {
            if (!cancelled && n > 0) {
                setPullStage('ask');
                setPullOpen(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [countRemote]);

    const runPull = useCallback(async () => {
        setPullStage('running');
        setPullProgress(null);
        const outcome = await pullAll(setPullProgress);
        setPullOutcome(outcome);
        setPullStage('done');
    }, [pullAll]);

    // ---------- Push on close ----------
    const [closeStage, setCloseStage] = useState<CloseStage>(null);
    const [pushProgress, setPushProgress] = useState<SessionSyncProgress | null>(null);
    const [pushOutcome, setPushOutcome] = useState<SessionSyncOutcome | null>(null);
    const [countdown, setCountdown] = useState(CLOSE_COUNTDOWN);
    const destroyingRef = useRef(false);

    const destroyWindow = useCallback(async () => {
        destroyingRef.current = true;
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().destroy();
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let disposed = false;
        void (async () => {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const win = getCurrentWindow();
            const off = await win.onCloseRequested(async (event) => {
                if (destroyingRef.current) return; // our own destroy(); let it through
                event.preventDefault();
                const n = await countRemote();
                if (n === 0) {
                    await destroyWindow();
                    return;
                }
                setCloseStage('confirm');
            });
            if (disposed) off();
            else unlisten = off;
        })();
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [countRemote, destroyWindow]);

    const runPush = useCallback(async () => {
        setCloseStage('pushing');
        setPushProgress(null);
        const outcome = await pushAll(setPushProgress);
        setPushOutcome(outcome);
        if (outcome.failed.length === 0) {
            setCountdown(CLOSE_COUNTDOWN);
            setCloseStage('success');
        } else {
            setCloseStage('fail');
        }
    }, [pushAll]);

    // Success → tick down then auto-close.
    useEffect(() => {
        if (closeStage !== 'success') return;
        if (countdown <= 0) {
            void destroyWindow();
            return;
        }
        const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [closeStage, countdown, destroyWindow]);

    return (
        <>
            {children}

            {/* ===== Pull on open ===== */}
            <Dialog
                open={pullOpen}
                onOpenChange={(open) => {
                    if (!open && pullStage !== 'running') setPullOpen(false);
                }}
            >
                <DialogContent showCloseButton={pullStage !== 'running'}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowDownToLine className="h-5 w-5 text-[var(--primary)]" />
                            Pull latest
                        </DialogTitle>
                        <DialogDescription>
                            {pullStage === 'ask' && 'Pull the latest changes from the repo before you start working?'}
                            {pullStage === 'running' && 'Pulling…'}
                            {pullStage === 'done' && 'Synced to this device.'}
                        </DialogDescription>
                    </DialogHeader>

                    {pullStage === 'running' && <ProgressRow label="Pulling" progress={pullProgress} />}
                    {pullStage === 'done' && pullOutcome && <OutcomeRow outcome={pullOutcome} />}

                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {pullStage === 'ask' && (
                            <>
                                <Button variant="ghost" onClick={() => setPullOpen(false)}>
                                    Skip
                                </Button>
                                <Button onClick={() => void runPull()}>Pull</Button>
                            </>
                        )}
                        {pullStage === 'done' && <Button onClick={() => setPullOpen(false)}>Continue</Button>}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ===== Push on close ===== */}
            <Dialog
                open={closeStage !== null}
                onOpenChange={(open) => {
                    if (!open && closeStage === 'confirm') setCloseStage(null);
                }}
            >
                <DialogContent showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {closeStage === 'success' ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                            ) : closeStage === 'fail' ? (
                                <AlertCircle className="h-5 w-5 text-[var(--error)]" />
                            ) : (
                                <ArrowUpFromLine className="h-5 w-5 text-[var(--primary)]" />
                            )}
                            {closeStage === 'success'
                                ? 'Pushed successfully'
                                : closeStage === 'fail'
                                  ? 'Push failed'
                                  : 'Close Open Sesame'}
                        </DialogTitle>
                        <DialogDescription>
                            {closeStage === 'confirm' && 'Push your changes to the repo before closing?'}
                            {closeStage === 'pushing' && 'Pushing changes to the repo…'}
                            {closeStage === 'success' && `Closing in ${countdown}s.`}
                            {closeStage === 'fail' && 'Some doc-sets could not be pushed — the window stays open.'}
                        </DialogDescription>
                    </DialogHeader>

                    {closeStage === 'pushing' && <ProgressRow label="Pushing" progress={pushProgress} />}
                    {(closeStage === 'success' || closeStage === 'fail') && pushOutcome && (
                        <OutcomeRow outcome={pushOutcome} />
                    )}

                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {closeStage === 'confirm' && (
                            <>
                                <Button variant="ghost" onClick={() => setCloseStage(null)}>
                                    Cancel
                                </Button>
                                <Button variant="outline" onClick={() => void destroyWindow()}>
                                    Close without pushing
                                </Button>
                                <Button onClick={() => void runPush()}>Push &amp; close</Button>
                            </>
                        )}
                        {closeStage === 'success' && (
                            <Button onClick={() => void destroyWindow()}>Close now</Button>
                        )}
                        {closeStage === 'fail' && (
                            <>
                                <Button variant="ghost" onClick={() => setCloseStage(null)}>
                                    Stay
                                </Button>
                                <Button variant="outline" onClick={() => void destroyWindow()}>
                                    Close without pushing
                                </Button>
                                <Button onClick={() => void runPush()}>Retry</Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function ProgressRow({ label, progress }: { label: string; progress: SessionSyncProgress | null }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
            <span className="min-w-0 flex-1 truncate text-[var(--on-surface)]">
                {progress ? `${label} “${progress.docSetName}”` : `${label}…`}
            </span>
            {progress && (
                <span className="shrink-0 text-xs text-[var(--on-surface-variant)]">
                    {progress.current}/{progress.total}
                </span>
            )}
        </div>
    );
}

function OutcomeRow({ outcome }: { outcome: SessionSyncOutcome }) {
    return (
        <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-[var(--on-surface)]">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {outcome.succeeded}/{outcome.total} doc-set · {outcome.filesCount} changes
            </div>
            {outcome.failed.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-[color-mix(in_srgb,var(--error)_30%,transparent)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] px-3 py-2 text-[var(--error)]">
                    {outcome.failed.map((f) => (
                        <li key={f.name} className="flex items-start gap-1.5">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                <span className="font-bold">{f.name}</span>: {f.message}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
