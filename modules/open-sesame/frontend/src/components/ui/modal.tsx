import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | '2xl' | 'xl';
}

export function Modal({ isOpen, onClose, title, description, children, size = 'md' }: ModalProps) {
    const sizeStyles = {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-md',
        lg: 'sm:max-w-lg',
        '2xl': 'sm:max-w-2xl',
        xl: '!max-w-[min(1180px,calc(100vw-2rem))]',
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={`gap-0 p-0 ${sizeStyles[size]}`}>
                {title && (
                    <DialogHeader className="border-b border-[var(--outline-variant)] px-6 py-4">
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {description || `${title} dialog`}
                        </DialogDescription>
                    </DialogHeader>
                )}
                <div className="px-6 py-4">{children}</div>
            </DialogContent>
        </Dialog>
    );
}
