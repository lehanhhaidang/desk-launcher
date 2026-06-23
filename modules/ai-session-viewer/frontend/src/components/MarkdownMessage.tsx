import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

/**
 * Compact Markdown renderer for chat bubbles. Mirrors the open-sesame /
 * md-converter preview approach (react-markdown + remark-gfm +
 * rehype-highlight) but sized for an assistant message and themed with this
 * module's own design tokens.
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="aisv-markdown text-sm leading-6 text-[var(--text)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="mb-2 mt-3 text-lg font-bold text-[var(--text)]">
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="mb-2 mt-3 text-base font-bold text-[var(--text)]">
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="mb-1.5 mt-3 text-sm font-bold text-[var(--text)]">
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="mb-1.5 mt-2.5 text-sm font-semibold text-[var(--text)]">
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p {...props} className="mb-2 last:mb-0">
              {children}
            </p>
          ),
          hr: ({ ...props }) => <hr {...props} className="my-4 h-px border-0 bg-[var(--line)]" />,
          ul: ({ children, ...props }) => (
            <ul {...props} className="mb-2 ml-5 list-disc space-y-1 marker:text-[var(--brand)]">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="mb-2 ml-5 list-decimal space-y-1 marker:text-[var(--brand)]">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="pl-0.5">
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="my-2 border-l-2 border-[var(--brand)]/50 bg-[var(--brand)]/5 px-3 py-1.5 italic text-[var(--text-muted)]"
            >
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-[var(--line)]">
              <table {...props} className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              {...props}
              className="border-b border-r border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1.5 text-left font-semibold last:border-r-0"
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              {...props}
              className="border-r border-t border-[var(--line)] px-2.5 py-1.5 align-top last:border-r-0"
            >
              {children}
            </td>
          ),
          code: ({ children, className, ...props }) => {
            const isBlock = /language-/.test(className || '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code {...props} className={`${className || ''} aisv-code-block`}>
                  {children}
                </code>
              )
            }
            return (
              <code
                {...props}
                className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--brand)]"
              >
                {children}
              </code>
            )
          },
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className="my-2.5 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 font-mono text-xs leading-5"
            >
              {children}
            </pre>
          ),
          a: ({ children, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--brand)] underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
