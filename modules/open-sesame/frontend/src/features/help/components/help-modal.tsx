import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button, Modal } from '@os/components/ui';
import { MarkdownDocument } from '@os/features/explorer/components/markdown-preview';
import guideEn from '../content/guide.en.md?raw';
import guideVi from '../content/guide.vi.md?raw';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type GuideLanguage = 'en' | 'vi';

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
    const [language, setLanguage] = useState<GuideLanguage>('en');
    const content = language === 'en' ? guideEn : guideVi;
    const fileName = language === 'en' ? 'Open Sesame Guide.md' : 'Huong Dan Open Sesame.md';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Guide Book"
            description="Read the Open Sesame user guide in English or Vietnamese."
            size="xl"
        >
            <div className="flex h-[min(760px,calc(100vh-10rem))] min-h-[520px] flex-col overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.025)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-[var(--on-surface)]">
                        <BookOpen className="h-4 w-4 text-[var(--primary)]" />
                        User Guide
                    </div>
                    <div className="flex rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.035)] p-0.5">
                        <Button
                            type="button"
                            size="sm"
                            variant={language === 'en' ? 'default' : 'ghost'}
                            onClick={() => setLanguage('en')}
                            className="h-7"
                        >
                            English
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={language === 'vi' ? 'default' : 'ghost'}
                            onClick={() => setLanguage('vi')}
                            className="h-7"
                        >
                            Tiếng Việt
                        </Button>
                    </div>
                </div>
                <div className="min-h-0 flex-1">
                    <MarkdownDocument
                        key={language}
                        content={content}
                        fileName={fileName}
                        size={content.length}
                        extension="md"
                    />
                </div>
            </div>
        </Modal>
    );
}

