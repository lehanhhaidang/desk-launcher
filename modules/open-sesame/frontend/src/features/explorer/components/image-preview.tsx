import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { readFile } from '@tauri-apps/plugin-fs';
import { LoadingState } from '@os/components/ui';
import { mimeFromExt } from '@os/lib/file-kinds';

interface ImagePreviewProps {
    filePath: string;
    fileName: string;
}

/** Standalone image viewer: reads the file bytes and shows them fit-to-pane. */
export function ImagePreview({ filePath, fileName }: ImagePreviewProps) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        setUrl(null);
        setError(null);
        readFile(filePath)
            .then((bytes) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeFromExt(filePath) }));
                setUrl(objectUrl);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || String(err));
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [filePath]);

    if (error) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="soft-panel flex max-w-md items-start gap-3 rounded-xl border p-4 text-sm text-[var(--error)]">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    if (!url) return <LoadingState label="Loading image" />;

    return (
        <div className="flex h-full flex-col">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--outline-variant)] bg-[rgba(16,16,21,0.82)] px-4 py-2 backdrop-blur-xl">
                <span className="truncate text-sm font-bold text-[var(--on-surface)]">{fileName}</span>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-6">
                <img
                    src={url}
                    alt={fileName}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
                />
            </div>
        </div>
    );
}
