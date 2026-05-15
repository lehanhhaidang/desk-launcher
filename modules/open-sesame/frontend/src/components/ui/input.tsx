import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, className = '', ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="mb-1 block text-[13px] font-semibold text-[var(--on-surface)]">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={`h-8 w-full rounded-md border bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--on-surface)] transition-all placeholder:text-[color-mix(in_srgb,var(--on-surface-variant)_65%,transparent)] focus:border-[rgba(183,156,255,0.5)] focus:bg-[rgba(255,255,255,0.06)] focus:outline-none focus:ring-1 focus:ring-[rgba(183,156,255,0.35)] ${error ? 'border-[var(--error)]' : 'border-[var(--outline-variant)]'
                        } ${className}`}
                    {...props}
                />
                {error && (
                    <p className="mt-1 text-sm text-[var(--error)]">{error}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
