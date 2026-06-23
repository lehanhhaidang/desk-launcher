import { useState } from 'react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { Bot, Download, RefreshCw, User } from 'lucide-react'
import { Button, LoadingSpinner } from '@desk-launcher/ui'
import type { ChatMessage, SessionEntry } from '../types'
import { formatIso } from '../format'
import { MarkdownMessage } from './MarkdownMessage'

interface Props {
  session: SessionEntry | null
  messages: ChatMessage[]
  loading: boolean
  onRefresh: () => void
}

function toMarkdown(session: SessionEntry, messages: ChatMessage[]): string {
  const header = `# ${session.title?.trim() || session.id}\n\n_Session \`${session.id}\`_\n`
  const body = messages
    .map((m) => {
      const who = m.role === 'user' ? '## 👤 User' : '## 🤖 Assistant'
      const when = m.timestamp ? ` _(${formatIso(m.timestamp)})_` : ''
      return `${who}${when}\n\n${m.content}\n`
    })
    .join('\n')
  return `${header}\n${body}`
}

export function ChatView({ session, messages, loading, onRefresh }: Props) {
  const [exporting, setExporting] = useState(false)

  async function exportAs(kind: 'json' | 'md') {
    if (!session || messages.length === 0) return
    setExporting(true)
    try {
      const defaultName = `${session.id}.${kind}`
      const filters =
        kind === 'json'
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'Markdown', extensions: ['md'] }]
      const target = await saveDialog({ defaultPath: defaultName, filters })
      if (!target) return
      const content =
        kind === 'json'
          ? JSON.stringify({ session, messages }, null, 2)
          : toMarkdown(session, messages)
      await writeTextFile(target, content)
    } catch (e) {
      console.error('export failed', e)
    } finally {
      setExporting(false)
    }
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        Select a session to read its conversation.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--text)]">
            {session.title?.trim() || session.id}
          </h2>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{session.id}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            title="Refresh"
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exporting || messages.length === 0}
            onClick={() => exportAs('md')}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> Markdown
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exporting || messages.length === 0}
            onClick={() => exportAs('json')}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> JSON
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <LoadingSpinner size="sm" /> Reading session…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No readable messages in this session.
          </p>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={['flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
      <div
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-[var(--brand)]/20 text-[var(--brand)]'
            : 'bg-[var(--panel-2)] text-[var(--text-muted)]',
        ].join(' ')}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={['flex min-w-0 max-w-[78%] flex-col', isUser ? 'items-end' : 'items-start'].join(' ')}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text)]">
            {isUser ? 'User' : 'Assistant'}
          </span>
          {message.timestamp && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {formatIso(message.timestamp)}
            </span>
          )}
        </div>
        <div
          className={[
            'rounded-lg border px-3 py-2 text-sm',
            isUser
              ? 'aisv-message-content border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--text)]'
              : 'border-[var(--line)] bg-[var(--panel)] text-[var(--text)]',
          ].join(' ')}
        >
          {isUser ? message.content : <MarkdownMessage content={message.content} />}
        </div>
      </div>
    </div>
  )
}
