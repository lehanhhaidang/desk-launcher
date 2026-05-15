import type { HTMLAttributes } from 'react';
import { cn } from '@os/lib/utils';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
}

export function Spinner({ size = 'md', label, className = '', ...props }: SpinnerProps) {
    const sizeStyles = {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-9 w-9',
    };

    return (
        <div className={cn('inline-flex items-center gap-2 text-[var(--on-surface-variant)]', className)} {...props}>
            <span className={cn('relative inline-flex', sizeStyles[size])}>
                <span className="absolute inset-0 rounded-full bg-[var(--purple-soft)] blur-sm" />
                <span className="absolute inset-0 rounded-full border border-[rgba(255,255,255,0.08)]" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--primary)] border-r-[var(--purple)]" />
                <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)] shadow-[0_0_14px_rgba(124,238,230,0.65)]" />
            </span>
            {label && <span className="text-sm font-semibold">{label}</span>}
        </div>
    );
}

export function LoadingState({
    label = 'Loading',
    className = '',
}: {
    label?: string;
    className?: string;
}) {
    return (
        <div className={cn('flex h-full min-h-28 flex-col items-center justify-center gap-4 text-center', className)}>
            <Spinner size="lg" />
            <div>
                <p className="text-sm font-bold text-[var(--on-surface)]">{label}</p>
                <div className="mt-3 flex justify-center gap-1.5">
                    <span className="loading-breathe h-1.5 w-8 rounded-full bg-[var(--primary)]" />
                    <span className="loading-breathe h-1.5 w-8 rounded-full bg-[var(--purple)] [animation-delay:160ms]" />
                    <span className="loading-breathe h-1.5 w-8 rounded-full bg-[var(--tertiary)] [animation-delay:320ms]" />
                </div>
            </div>
        </div>
    );
}

export function LoadingSkeleton({ className = '' }: { className?: string }) {
    return (
        <div className={cn('space-y-2 p-3', className)}>
            <div className="loading-shimmer h-8 rounded-lg bg-[rgba(255,255,255,0.045)]" />
            <div className="loading-shimmer h-8 rounded-lg bg-[rgba(255,255,255,0.035)]" />
            <div className="loading-shimmer h-8 w-3/4 rounded-lg bg-[rgba(255,255,255,0.035)]" />
        </div>
    );
}
