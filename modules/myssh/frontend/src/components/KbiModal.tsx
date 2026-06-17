import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import { onKbiPrompt, respondKeyboardInteractive, type KbiPrompt } from '../api/myssh-api'

/** Global listener for keyboard-interactive (OTP/2FA) auth prompts. Mount once. */
export function KbiModal() {
  const [prompt, setPrompt] = useState<KbiPrompt | null>(null)
  const [answers, setAnswers] = useState<string[]>([])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    onKbiPrompt((p) => {
      setPrompt(p)
      setAnswers(p.prompts.map(() => ''))
    }).then((u) => {
      if (disposed) u()
      else unlisten = u
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  if (!prompt) return null

  const respond = (values: string[]) => {
    respondKeyboardInteractive(prompt.requestId, values).catch(() => {})
    setPrompt(null)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel w-full max-w-md rounded-xl border p-6 shadow-2xl">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
          <KeyRound className="size-5 text-[var(--brand)]" /> {prompt.name || 'Authentication required'}
        </h2>
        {prompt.instructions && (
          <p className="mb-3 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{prompt.instructions}</p>
        )}

        <div className="space-y-3">
          {prompt.prompts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">The server is waiting — continue to proceed.</p>
          ) : (
            prompt.prompts.map((p, i) => (
              <div key={i}>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {p.prompt}
                </label>
                <input
                  autoFocus={i === 0}
                  type={p.echo ? 'text' : 'password'}
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[color-mix(in_oklch,var(--brand)_40%,transparent)]"
                  value={answers[i] ?? ''}
                  onChange={(e) =>
                    setAnswers((a) => {
                      const next = [...a]
                      next[i] = e.target.value
                      return next
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && i === prompt.prompts.length - 1) respond(answers)
                  }}
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => respond(prompt.prompts.map(() => ''))}>
            Cancel
          </Button>
          <Button onClick={() => respond(answers)}>Submit</Button>
        </div>
      </div>
    </div>
  )
}
