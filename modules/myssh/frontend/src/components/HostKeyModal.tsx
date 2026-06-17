import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import { onHostKeyPrompt, respondHostKey, type HostKeyPrompt } from '../api/myssh-api'

/** Global listener that surfaces interactive host-key decisions. Mount once. */
export function HostKeyModal() {
  const [prompt, setPrompt] = useState<HostKeyPrompt | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    onHostKeyPrompt((p) => setPrompt(p)).then((u) => {
      if (disposed) u()
      else unlisten = u
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  if (!prompt) return null

  const respond = (accept: boolean) => {
    respondHostKey(prompt.requestId, accept).catch(() => {})
    setPrompt(null)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel w-full max-w-md rounded-xl border p-6 shadow-2xl">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[#edf3f7]">
          {prompt.changed ? (
            <>
              <ShieldAlert className="size-5 text-[#ffb4ab]" /> Host key changed
            </>
          ) : (
            <>
              <ShieldCheck className="size-5 text-cyan-300" /> Unknown host key
            </>
          )}
        </h2>

        {prompt.changed ? (
          <p className="mb-3 text-sm text-[#ffb4ab]">
            The host key for{' '}
            <span className="font-mono">
              {prompt.host}:{prompt.port}
            </span>{' '}
            is different from the one stored. This can mean the server was re-keyed — or a
            man-in-the-middle attack. Only accept if you trust the change.
          </p>
        ) : (
          <p className="mb-3 text-sm text-[#9aa6b6]">
            First time connecting to{' '}
            <span className="font-mono">
              {prompt.host}:{prompt.port}
            </span>
            . Verify the fingerprint before accepting.
          </p>
        )}

        <div className="mb-5 rounded-md border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-[#7c8797]">
            {prompt.keyType}
          </div>
          <div className="break-all font-mono text-sm text-[#e6edf3]">{prompt.fingerprint}</div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => respond(false)}>
            Reject
          </Button>
          <Button onClick={() => respond(true)}>
            {prompt.changed ? 'Accept new key' : 'Accept & connect'}
          </Button>
        </div>
      </div>
    </div>
  )
}
