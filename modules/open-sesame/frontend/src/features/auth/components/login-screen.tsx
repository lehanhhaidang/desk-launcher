import { useState, useRef, useEffect } from 'react';
import { invoke, InvokeError } from '@os/lib/tauri';
import { open } from '@tauri-apps/plugin-shell';
import { Button, Spinner } from '@os/components/ui';
import { useAuthStore } from '@os/stores/auth-store';
import type { Account } from '@os/types/models';

function GitHubIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
    );
}

type LoginState =
    | { step: 'idle' }
    | { step: 'awaiting'; userCode: string; verificationUri: string }
    | { step: 'polling'; userCode: string; verificationUri: string }
    | { step: 'error'; message: string };

/** Check if an error is a retryable "authorization_pending" or "slow_down" */
function isAuthPending(err: unknown): 'pending' | 'slow_down' | false {
    // Handle InvokeError from our wrapper
    if (err instanceof InvokeError) {
        if (err.message.includes('authorization_pending')) return 'pending';
        if (err.message.includes('slow_down')) return 'slow_down';
        return false;
    }
    // Handle raw Tauri error object { kind, message }
    if (typeof err === 'object' && err !== null && 'message' in err) {
        const msg = String((err as any).message);
        if (msg.includes('authorization_pending')) return 'pending';
        if (msg.includes('slow_down')) return 'slow_down';
        return false;
    }
    // Handle plain string errors
    if (typeof err === 'string') {
        if (err.includes('authorization_pending')) return 'pending';
        if (err.includes('slow_down')) return 'slow_down';
    }
    return false;
}

function getErrorMessage(err: unknown): string {
    if (err instanceof InvokeError) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as any).message);
    }
    return String(err);
}

export function LoginScreen() {
    const [state, setState] = useState<LoginState>({ step: 'idle' });
    const cancelledRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const startGitHubLogin = async () => {
        cancelledRef.current = false;
        try {
            const resp = await invoke<{
                device_code: string;
                user_code: string;
                verification_uri: string;
                interval: number;
                expires_in: number;
            }>('auth_github_start');

            setState({ step: 'awaiting', userCode: resp.user_code, verificationUri: resp.verification_uri });

            // Open browser for user to enter the code
            await open(resp.verification_uri);

            // Start polling
            setState({ step: 'polling', userCode: resp.user_code, verificationUri: resp.verification_uri });
            pollForToken(resp.device_code, resp.interval, resp.expires_in);
        } catch (err) {
            setState({ step: 'error', message: getErrorMessage(err) });
        }
    };

    const pollForToken = async (deviceCode: string, interval: number, expiresIn: number) => {
        const deadline = Date.now() + expiresIn * 1000;
        let currentInterval = interval;

        const poll = async () => {
            // Stop if cancelled or expired
            if (cancelledRef.current) return;
            if (Date.now() > deadline) {
                setState({ step: 'error', message: 'Device code expired. Please try again.' });
                return;
            }

            try {
                const account = await invoke<Account>('auth_github_poll', { deviceCode });

                // Success! Update the store so App.tsx re-renders
                if (!cancelledRef.current) {
                    const currentAccounts = useAuthStore.getState().accounts;
                    useAuthStore.getState().setAccounts([...currentAccounts, account]);
                }
            } catch (err: unknown) {
                if (cancelledRef.current) return;

                const pendingType = isAuthPending(err);
                if (pendingType === 'pending') {
                    timerRef.current = setTimeout(poll, currentInterval * 1000);
                } else if (pendingType === 'slow_down') {
                    currentInterval += 5;
                    timerRef.current = setTimeout(poll, currentInterval * 1000);
                } else {
                    setState({ step: 'error', message: getErrorMessage(err) });
                }
            }
        };

        poll();
    };

    const handleCancel = () => {
        cancelledRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setState({ step: 'idle' });
    };

    return (
        <div className="app-bg flex h-screen items-center justify-center p-10 text-[var(--on-surface)]">
            <main className="soft-panel purple-haze relative z-10 flex w-full max-w-[480px] flex-col rounded-xl border p-10">
                <header className="mb-10 text-center">
                    <div className="lux-gradient mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl text-[#071413] shadow-[0_14px_40px_rgba(183,156,255,0.18)]">
                        <GitHubIcon className="h-8 w-8" />
                    </div>
                    <h1 className="lux-text mb-1 text-3xl font-bold tracking-tight">Open Sesame</h1>
                    <p className="text-base font-medium text-[var(--on-surface-variant)]">Your docs. Everywhere.</p>
                </header>

                {state.step === 'idle' && (
                    <div className="flex flex-col gap-4">
                        <h2 className="text-center text-xl font-bold text-[var(--on-surface)]">Connect GitHub to get started</h2>
                        <button
                            onClick={startGitHubLogin}
                            className="soft-card group flex w-full items-center gap-4 rounded-xl border border-l-[3px] border-l-[var(--primary)] p-4 text-left transition-all duration-200"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface-variant)] transition-colors group-hover:border-[color-mix(in_srgb,var(--primary)_35%,transparent)] group-hover:text-[var(--primary)]">
                                <GitHubIcon className="h-5 w-5" />
                            </div>
                            <span className="flex-1 text-[13px] font-bold text-[var(--on-surface)]">GitHub</span>
                            <span className="text-[var(--on-surface-variant)] opacity-0 transition-opacity group-hover:opacity-100">→</span>
                        </button>
                        <p className="px-4 text-center text-sm font-medium text-[var(--on-surface-variant)]">
                            More providers can come later; this build focuses on GitHub.
                        </p>
                    </div>
                )}

                {(state.step === 'awaiting' || state.step === 'polling') && (
                    <div className="space-y-5 text-center">
                        <p className="text-sm font-semibold text-[var(--on-surface-variant)]">Enter this code on GitHub</p>
                        <code className="inline-flex rounded border border-[var(--outline-variant)] bg-[var(--surface-highest)] px-5 py-3 font-mono text-2xl text-[var(--primary)]">
                            {state.userCode}
                        </code>
                        <div className="flex items-center justify-center gap-2 text-sm text-[var(--on-surface-variant)]">
                            <Spinner className="h-4 w-4" />
                            <span>Waiting for authorization...</span>
                        </div>
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                    </div>
                )}

                {state.step === 'error' && (
                    <div className="space-y-4 text-center">
                        <p className="rounded border border-[color-mix(in_srgb,var(--error)_40%,transparent)] bg-[color-mix(in_srgb,var(--error-container)_45%,transparent)] px-4 py-3 text-sm text-[var(--error)]">
                            {state.message}
                        </p>
                        <Button variant="outline" onClick={() => setState({ step: 'idle' })}>
                            Try again
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
}
