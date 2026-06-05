import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { FileText } from 'lucide-react'

interface MarkdownDocumentProps {
  content: string
  fileName: string
  format?: string
}

const markdownExtensions = new Set(['md', 'markdown', 'mdown', 'mkdn'])
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
]

export function MarkdownDocument({ content, fileName, format }: MarkdownDocumentProps) {
  const isMarkdown = useMemo(() => {
    const ext = (format || fileName.split('.').pop() || '').toLowerCase()
    return markdownExtensions.has(ext) || content.trimStart().startsWith('#')
  }, [content, fileName, format])

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--outline-variant)] bg-[rgba(16,16,21,0.82)] px-4 py-2 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-[var(--purple)]" />
          <span className="truncate text-sm font-bold text-[var(--on-surface)]">{fileName}</span>
          {format && <span className="shrink-0 text-xs uppercase text-[var(--on-surface-variant)]">{format}</span>}
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-6">
        {isMarkdown ? (
          <MarkdownBody content={content} />
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.72)] p-4 font-mono text-sm leading-6 text-[var(--on-surface)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}

function MarkdownBody({ content }: { content: string }) {
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
            const code = String(children).replace(/\n$/, '')
            if (className?.includes('language-mermaid') || looksLikeMermaid(code)) {
              return (
                <code {...props} className="block whitespace-pre-wrap rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.72)] p-4 font-mono text-sm leading-6 text-[var(--primary)]">
                  {code}
                </code>
              )
            }

            // Block code (fenced / multiline): keep highlight.js token classes
            // and let the <pre> wrapper own the box. Only inline code gets the pill.
            const isBlock = /language-/.test(className || '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code {...props} className={`${className || ''} md-code-block`}>
                  {children}
                </code>
              )
            }

            return (
              <code {...props} className={`${className || ''} rounded bg-[rgba(183,156,255,0.12)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--primary)]`}>
                {children}
              </code>
            )
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
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}

function looksLikeMermaid(code: string): boolean {
  const firstLine = code.trimStart().split('\n')[0]?.trim() || ''
  return mermaidStarts.some((start) => firstLine.startsWith(start))
}
