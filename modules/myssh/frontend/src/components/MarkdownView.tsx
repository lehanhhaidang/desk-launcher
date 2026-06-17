import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

/** Markdown renderer mirroring Open Sesame's preview styling. */
export function MarkdownView({ content }: { content: string }) {
  return (
    <article className="max-w-none text-[15px] leading-7 text-[var(--on-surface-variant)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="mb-5 mt-2 text-3xl font-bold leading-tight text-[var(--on-surface)]">
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="mb-4 mt-8 border-b border-[var(--outline-variant)] pb-2 text-2xl font-bold text-[var(--on-surface)]">
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="mb-3 mt-6 text-xl font-bold text-[var(--on-surface)]">
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="mb-2 mt-5 text-base font-bold text-[var(--on-surface)]">
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p {...props} className="mb-4">
              {children}
            </p>
          ),
          hr: ({ ...props }) => <hr {...props} className="my-8 h-px border-0 bg-[var(--outline-variant)]" />,
          ul: ({ children, ...props }) => (
            <ul {...props} className="mb-5 ml-5 list-disc space-y-2 marker:text-[var(--purple)]">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="mb-5 ml-5 list-decimal space-y-2 marker:text-[var(--primary)]">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="pl-1">
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote {...props} className="my-5 rounded-r-lg border-l-4 border-[var(--purple)] bg-[var(--purple-soft)] px-4 py-3 italic text-[var(--on-surface)]">
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-[var(--outline-variant)]">
              <table {...props} className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th {...props} className="border-b border-r border-[var(--outline-variant)] px-4 py-2 text-left font-bold last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td {...props} className="border-r border-t border-[var(--outline-variant)] px-4 py-2 align-top last:border-r-0">
              {children}
            </td>
          ),
          code: ({ children, className, ...props }) => {
            const isBlock = /language-/.test(className || '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code {...props} className={`${className || ''} md-code-block`}>
                  {children}
                </code>
              )
            }
            return (
              <code {...props} className="rounded bg-[rgba(183,156,255,0.12)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--primary)]">
                {children}
              </code>
            )
          },
          pre: ({ children, ...props }) => (
            <pre {...props} className="my-5 overflow-x-auto rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.72)] p-4 text-sm leading-6">
              {children}
            </pre>
          ),
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary)] underline underline-offset-4 hover:text-[var(--purple)]">
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
