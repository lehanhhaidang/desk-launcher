import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { AlertCircle, FileText, ImageOff, Loader2 } from 'lucide-react';
import { readFile } from '@tauri-apps/plugin-fs';
import { LoadingState } from '@os/components/ui';
import { invoke } from '@os/lib/tauri';
import { dirOf, isRemoteOrData, mimeFromExt, resolveLocalPath } from '@os/lib/file-kinds';
import { MermaidDiagram } from './mermaid-diagram';

interface FileContent {
    content: string;
    size: number;
    truncated: boolean;
    extension: string | null;
}

interface MarkdownPreviewProps {
    filePath: string;
    fileName: string;
}

interface MarkdownDocumentProps {
    content: string;
    fileName: string;
    size?: number;
    truncated?: boolean;
    extension?: string | null;
    basePath?: string;
}

const markdownExtensions = new Set(['md', 'markdown', 'mdown', 'mkdn']);
const mermaidStarts = [
    'flowchart',
    'graph',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'gitGraph',
    'mindmap',
    'timeline',
    'quadrantChart',
    'requirementDiagram',
    'c4Context',
];

export function MarkdownPreview({ filePath, fileName }: MarkdownPreviewProps) {
    const [content, setContent] = useState<FileContent | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setContent(null);
        setError(null);
        invoke<FileContent>('file_content', { filePath })
            .then(setContent)
            .catch((err) => setError(err.message || 'Failed to load file'));
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

    if (!content) {
        return <LoadingState label="Loading preview" />;
    }

    return (
        <MarkdownDocument
            content={content.content}
            fileName={fileName}
            size={content.size}
            truncated={content.truncated}
            extension={content.extension}
            basePath={dirOf(filePath)}
        />
    );
}

export function MarkdownDocument({ content, fileName, size, truncated = false, extension, basePath }: MarkdownDocumentProps) {
    const isMarkdown = useMemo(() => {
        const ext = (extension || fileName.split('.').pop() || '').toLowerCase();
        return markdownExtensions.has(ext);
    }, [extension, fileName]);

    return (
        <div className="h-full overflow-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--outline-variant)] bg-[rgba(16,16,21,0.82)] px-4 py-2 backdrop-blur-xl">
                <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--purple)]" />
                    <span className="truncate text-sm font-bold text-[var(--on-surface)]">{fileName}</span>
                    {typeof size === 'number' && (
                        <span className="shrink-0 text-xs text-[var(--on-surface-variant)]">
                            {formatFileSize(size)}
                            {truncated && ' (truncated)'}
                        </span>
                    )}
                </div>
            </div>

            <div className="mx-auto max-w-4xl p-6">
                {isMarkdown ? <MarkdownBody content={content} basePath={basePath} /> : (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.72)] p-4 font-mono text-sm leading-6 text-[var(--on-surface)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                        {content}
                    </pre>
                )}
            </div>
        </div>
    );
}

function MarkdownBody({ content, basePath }: { content: string; basePath?: string }) {
    return (
        <article className="max-w-none text-[15px] leading-7 text-[var(--on-surface-variant)]">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                    h1: ({ children, ...props }) => (
                        <h1 {...props} className="mb-5 mt-2 scroll-m-20 text-4xl font-bold leading-tight tracking-normal text-[var(--on-surface)]">
                            {children}
                        </h1>
                    ),
                    h2: ({ children, ...props }) => (
                        <h2 {...props} className="mb-4 mt-9 scroll-m-20 border-b border-[var(--outline-variant)] pb-2 text-2xl font-bold leading-tight tracking-normal text-[var(--on-surface)]">
                            {children}
                        </h2>
                    ),
                    h3: ({ children, ...props }) => (
                        <h3 {...props} className="mb-3 mt-7 scroll-m-20 text-xl font-bold leading-snug tracking-normal text-[var(--on-surface)]">
                            {children}
                        </h3>
                    ),
                    h4: ({ children, ...props }) => (
                        <h4 {...props} className="mb-2 mt-6 scroll-m-20 text-base font-bold tracking-normal text-[var(--on-surface)]">
                            {children}
                        </h4>
                    ),
                    p: ({ children, ...props }) => <p {...props} className="mb-4">{children}</p>,
                    hr: ({ ...props }) => (
                        <hr {...props} className="my-8 h-px border-0 bg-gradient-to-r from-transparent via-[rgba(183,156,255,0.38)] to-transparent" />
                    ),
                    ul: ({ children, ...props }) => (
                        <ul {...props} className="mb-5 ml-5 list-disc space-y-2 marker:text-[var(--purple)]">{children}</ul>
                    ),
                    ol: ({ children, ...props }) => (
                        <ol {...props} className="mb-5 ml-5 list-decimal space-y-2 marker:font-bold marker:text-[var(--primary)]">{children}</ol>
                    ),
                    li: ({ children, ...props }) => <li {...props} className="pl-1">{children}</li>,
                    blockquote: ({ children, ...props }) => (
                        <blockquote {...props} className="my-5 rounded-r-lg border-l-4 border-[var(--purple)] bg-[var(--purple-soft)] px-4 py-3 italic text-[var(--on-surface)]">
                            {children}
                        </blockquote>
                    ),
                    table: ({ children, ...props }) => (
                        <div className="my-6 overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.38)]">
                            <div className="overflow-x-auto">
                                <table {...props} className="w-full border-collapse text-sm">{children}</table>
                            </div>
                        </div>
                    ),
                    thead: ({ children, ...props }) => <thead {...props} className="bg-[rgba(183,156,255,0.13)] text-[var(--on-surface)]">{children}</thead>,
                    th: ({ children, ...props }) => <th {...props} className="border-b border-r border-[var(--outline-variant)] px-4 py-3 text-left font-bold last:border-r-0">{children}</th>,
                    td: ({ children, ...props }) => <td {...props} className="border-r border-t border-[var(--outline-variant)] px-4 py-3 align-top last:border-r-0">{children}</td>,
                    tr: ({ children, ...props }) => <tr {...props} className="transition-colors even:bg-[rgba(255,255,255,0.025)] hover:bg-[rgba(124,238,230,0.045)]">{children}</tr>,
                    code: ({ children, className, ...props }) => {
                        const code = String(children).replace(/\n$/, '');
                        if (className?.includes('language-mermaid') || looksLikeMermaid(code)) {
                            return <MermaidDiagram chart={code} />;
                        }

                        // Block code (fenced / multiline): keep highlight.js token
                        // classes and let the <pre> wrapper own the box. Only inline
                        // code gets the rounded "pill" treatment.
                        const isBlock = /language-/.test(className || '') || String(children).includes('\n');
                        if (isBlock) {
                            return (
                                <code {...props} className={`${className || ''} md-code-block`}>
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <code {...props} className={`${className || ''} rounded bg-[rgba(183,156,255,0.12)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--primary)]`}>
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children, ...props }) => (
                        <pre {...props} className="my-5 overflow-x-auto rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.72)] p-4 text-sm leading-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                            {children}
                        </pre>
                    ),
                    a: ({ children, ...props }) => (
                        <a {...props} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary)] underline decoration-[rgba(124,238,230,0.35)] underline-offset-4 transition-colors hover:text-[var(--purple)]">
                            {children}
                        </a>
                    ),
                    img: ({ src, alt }) => (
                        <MarkdownImage
                            src={typeof src === 'string' ? src : undefined}
                            alt={typeof alt === 'string' ? alt : undefined}
                            basePath={basePath}
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </article>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MarkdownImage({ src, alt, basePath }: { src?: string; alt?: string; basePath?: string }) {
    const [resolved, setResolved] = useState<string | null>(src && isRemoteOrData(src) ? src : null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!src) {
            setFailed(true);
            return;
        }
        if (isRemoteOrData(src)) {
            setResolved(src);
            setFailed(false);
            return;
        }
        let cancelled = false;
        let objectUrl: string | null = null;
        setResolved(null);
        setFailed(false);
        const abs = resolveLocalPath(basePath ?? '', src);
        readFile(abs)
            .then((bytes) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeFromExt(abs) }));
                setResolved(objectUrl);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src, basePath]);

    if (failed) {
        return (
            <span className="my-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-xs text-[var(--on-surface-variant)]">
                <ImageOff className="h-3.5 w-3.5 shrink-0" />
                {alt || 'image unavailable'}
            </span>
        );
    }

    if (!resolved) {
        return (
            <span className="my-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--outline-variant)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-xs text-[var(--on-surface-variant)]">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                {alt || 'loading image'}
            </span>
        );
    }

    return (
        <img
            src={resolved}
            alt={alt ?? ''}
            loading="lazy"
            className="my-4 h-auto max-w-full rounded-xl border border-[var(--outline-variant)]"
        />
    );
}

function looksLikeMermaid(code: string): boolean {
    const firstLine = code.trimStart().split('\n')[0]?.trim() || '';
    return mermaidStarts.some((start) => firstLine.startsWith(start));
}
