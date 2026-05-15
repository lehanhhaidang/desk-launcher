import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@os/lib/utils';

export interface SelectOption<T extends string> {
    value: T;
    label: string;
}

interface SelectProps<T extends string> {
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    disabled?: boolean;
    className?: string;
}

export function Select<T extends string>({
    value,
    options,
    onChange,
    disabled = false,
    className,
}: SelectProps<T>) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.value === value) ?? options[0];

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    return (
        <div ref={ref} className={cn('relative inline-block', className)}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((value) => !value)}
                className="flex h-8 w-full min-w-[112px] items-center justify-between gap-2 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] px-2.5 text-sm font-semibold text-[var(--on-surface)] transition-all hover:border-[rgba(183,156,255,0.45)] hover:bg-[rgba(255,255,255,0.055)] focus:border-[rgba(183,156,255,0.5)] focus:outline-none focus:ring-1 focus:ring-[rgba(183,156,255,0.35)] disabled:opacity-50"
            >
                <span className="truncate">{selected?.label}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--on-surface-variant)] transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+4px)] z-[70] min-w-full overflow-hidden rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] p-1 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                            className={cn(
                                'flex h-8 w-full items-center rounded px-2.5 text-left text-sm font-medium text-[var(--on-surface)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--primary)]',
                                option.value === value && 'bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]',
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
