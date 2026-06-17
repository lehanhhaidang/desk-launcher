import { useEffect, useState } from 'react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import { listKnownHosts, removeKnownHost, type KnownHost } from '../api/myssh-api'

interface Props {
  open: boolean
  onClose: () => void
}

export function KnownHostsPanel({ open, onClose }: Props) {
  const [items, setItems] = useState<KnownHost[]>([])

  const refresh = () => {
    listKnownHosts()
      .then(setItems)
      .catch((e) => toast.error(`Failed to load known hosts: ${errMessage(e)}`))
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  if (!open) return null

  const forget = async (h: KnownHost) => {
    const ok = await confirm(
      `Forget the stored key for ${h.host}:${h.port}? The next connection will trust on first use again — only do this if you know the server's key changed legitimately.`,
      { title: 'Forget host key', kind: 'warning' },
    )
    if (!ok) return
    try {
      await removeKnownHost(h.host, h.port)
      refresh()
    } catch (e) {
      toast.error(`Failed: ${errMessage(e)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#edf3f7]">
            <ShieldCheck className="size-5 text-cyan-300" /> Known hosts
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="overflow-y-auto rounded-lg border border-white/10">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#7c8797]">
              No host keys remembered yet.
            </p>
          ) : (
            items.map((h) => (
              <div
                key={`${h.host}:${h.port}`}
                className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {h.host}:{h.port}
                  </div>
                  <div className="truncate font-mono text-xs text-[#7c8797]">
                    {h.keyType} · {h.fingerprint}
                  </div>
                </div>
                <button
                  className="text-[#9aa6b6] transition hover:text-[#ffb4ab]"
                  title="Forget this key"
                  onClick={() => forget(h)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
