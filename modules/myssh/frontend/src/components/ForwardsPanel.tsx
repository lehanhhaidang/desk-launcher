import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button } from '@desk-launcher/ui'
import {
  createForward,
  deleteForward,
  listForwards,
  startForward,
  stopForward,
  type Forward,
  type ForwardStatus,
  type Host,
} from '../api/myssh-api'

interface Props {
  open: boolean
  onClose: () => void
  hosts: Host[]
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[color-mix(in_oklch,var(--brand)_40%,transparent)]'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]'

export function ForwardsPanel({ open, onClose, hosts }: Props) {
  const [items, setItems] = useState<ForwardStatus[]>([])
  const [hostId, setHostId] = useState('')
  const [label, setLabel] = useState('')
  const [bindAddr, setBindAddr] = useState('127.0.0.1')
  const [bindPort, setBindPort] = useState('')
  const [destHost, setDestHost] = useState('127.0.0.1')
  const [destPort, setDestPort] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [kind, setKind] = useState<'local' | 'remote' | 'dynamic'>('local')

  const refresh = () => {
    listForwards()
      .then(setItems)
      .catch((e) => toast.error(`Failed to load forwards: ${errMessage(e)}`))
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  if (!open) return null

  const hostName = (id: string) => hosts.find((h) => h.id === id)?.label ?? 'Unknown host'

  const add = async () => {
    const bp = Number(bindPort)
    const dp = Number(destPort)
    const isDynamic = kind === 'dynamic'
    if (!hostId) return toast.error('Pick a host')
    if (!Number.isInteger(bp) || bp < 1 || bp > 65535) return toast.error('Bind port must be 1–65535')
    if (!isDynamic) {
      if (!destHost.trim()) return toast.error('Destination host is required')
      if (!Number.isInteger(dp) || dp < 1 || dp > 65535) return toast.error('Destination port must be 1–65535')
    }
    try {
      await createForward({
        hostId,
        kind,
        bindAddr: bindAddr.trim() || '127.0.0.1',
        bindPort: bp,
        destHost: isDynamic ? '' : destHost.trim(),
        destPort: isDynamic ? 0 : dp,
        label: label.trim(),
        autoStart,
      })
      setLabel('')
      setBindPort('')
      setDestPort('')
      setAutoStart(false)
      refresh()
    } catch (e) {
      toast.error(`Create failed: ${errMessage(e)}`)
    }
  }

  const toggle = async (item: ForwardStatus) => {
    try {
      if (item.running) await stopForward(item.forward.id)
      else await startForward(item.forward.id)
      refresh()
    } catch (e) {
      toast.error(`${item.running ? 'Stop' : 'Start'} failed: ${errMessage(e)}`)
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteForward(id)
      refresh()
    } catch (e) {
      toast.error(`Delete failed: ${errMessage(e)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel flex max-h-[82vh] w-full max-w-2xl flex-col rounded-xl border p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Port forwarding</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-faint)]">No forwards yet.</p>
          ) : (
            items.map(({ forward: f, running }) => (
              <div
                key={f.id}
                className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${running ? 'bg-emerald-400' : 'bg-white/20'}`}
                  title={running ? 'Running' : 'Stopped'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    {f.label || 'Local forward'}
                    {f.autoStart && (
                      <span className="rounded bg-[color-mix(in_oklch,var(--brand)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--text-faint)]">
                    {routeText(f)} · {hostName(f.hostId)}
                  </div>
                </div>
                <button
                  className="text-[var(--text-muted)] transition hover:text-[var(--brand)]"
                  title={running ? 'Stop' : 'Start'}
                  onClick={() => toggle({ forward: f, running })}
                >
                  {running ? <Square className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  className="text-[var(--text-muted)] transition hover:text-[#ffb4ab]"
                  title="Delete"
                  onClick={() => remove(f.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Host (SSH server to tunnel through)</label>
            <select className={inputClass} value={hostId} onChange={(e) => setHostId(e.target.value)}>
              <option value="">Select a host…</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="local">Local (-L) — local port → destination via host</option>
              <option value="remote">Remote (-R) — host port → destination here</option>
              <option value="dynamic">Dynamic (-D) — local SOCKS5 proxy</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Label (optional)</label>
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Remote Postgres" />
          </div>
          <div>
            <label className={labelClass}>{kind === 'remote' ? 'Remote bind address' : 'Bind address'}</label>
            <input className={inputClass} value={bindAddr} onChange={(e) => setBindAddr(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>
              {kind === 'dynamic' ? 'SOCKS port' : kind === 'remote' ? 'Remote port' : 'Local port'}
            </label>
            <input className={inputClass} value={bindPort} onChange={(e) => setBindPort(e.target.value)} inputMode="numeric" placeholder={kind === 'dynamic' ? '1080' : '5433'} />
          </div>
          {kind !== 'dynamic' && (
            <>
              <div>
                <label className={labelClass}>Destination host</label>
                <input className={inputClass} value={destHost} onChange={(e) => setDestHost(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Destination port</label>
                <input className={inputClass} value={destPort} onChange={(e) => setDestPort(e.target.value)} inputMode="numeric" placeholder="5432" />
              </div>
            </>
          )}
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
            Auto-start this forward when MySSH opens
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={add}>
            <Plus className="size-4" /> Add forward
          </Button>
        </div>
      </div>
    </div>
  )
}

function routeText(f: Forward): string {
  if (f.kind === 'dynamic') return `SOCKS ${f.bindAddr}:${f.bindPort}`
  if (f.kind === 'remote') return `remote ${f.bindAddr}:${f.bindPort} → ${f.destHost}:${f.destPort}`
  return `${f.bindAddr}:${f.bindPort} → ${f.destHost}:${f.destPort}`
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
