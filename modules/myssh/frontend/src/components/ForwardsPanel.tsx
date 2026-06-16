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
  type ForwardStatus,
  type Host,
} from '../api/myssh-api'

interface Props {
  open: boolean
  onClose: () => void
  hosts: Host[]
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#edf3f7] outline-none transition focus:border-cyan-300/40'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9aa6b6]'

export function ForwardsPanel({ open, onClose, hosts }: Props) {
  const [items, setItems] = useState<ForwardStatus[]>([])
  const [hostId, setHostId] = useState('')
  const [label, setLabel] = useState('')
  const [bindAddr, setBindAddr] = useState('127.0.0.1')
  const [bindPort, setBindPort] = useState('')
  const [destHost, setDestHost] = useState('127.0.0.1')
  const [destPort, setDestPort] = useState('')

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
    if (!hostId) return toast.error('Pick a host')
    if (!Number.isInteger(bp) || bp < 1 || bp > 65535) return toast.error('Local port must be 1–65535')
    if (!destHost.trim()) return toast.error('Destination host is required')
    if (!Number.isInteger(dp) || dp < 1 || dp > 65535) return toast.error('Destination port must be 1–65535')
    try {
      await createForward({
        hostId,
        kind: 'local',
        bindAddr: bindAddr.trim() || '127.0.0.1',
        bindPort: bp,
        destHost: destHost.trim(),
        destPort: dp,
        label: label.trim(),
      })
      setLabel('')
      setBindPort('')
      setDestPort('')
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
          <h2 className="text-lg font-semibold text-[#edf3f7]">Port forwarding</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-white/10">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#7c8797]">No forwards yet.</p>
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
                  <div className="truncate text-sm font-medium">{f.label || 'Local forward'}</div>
                  <div className="truncate font-mono text-xs text-[#7c8797]">
                    {f.bindAddr}:{f.bindPort} → {f.destHost}:{f.destPort} · {hostName(f.hostId)}
                  </div>
                </div>
                <button
                  className="text-[#9aa6b6] transition hover:text-cyan-300"
                  title={running ? 'Stop' : 'Start'}
                  onClick={() => toggle({ forward: f, running })}
                >
                  {running ? <Square className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  className="text-[#9aa6b6] transition hover:text-[#ffb4ab]"
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
            <label className={labelClass}>Label (optional)</label>
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Remote Postgres" />
          </div>
          <div>
            <label className={labelClass}>Local bind address</label>
            <input className={inputClass} value={bindAddr} onChange={(e) => setBindAddr(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Local port</label>
            <input className={inputClass} value={bindPort} onChange={(e) => setBindPort(e.target.value)} inputMode="numeric" placeholder="5433" />
          </div>
          <div>
            <label className={labelClass}>Destination host</label>
            <input className={inputClass} value={destHost} onChange={(e) => setDestHost(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Destination port</label>
            <input className={inputClass} value={destPort} onChange={(e) => setDestPort(e.target.value)} inputMode="numeric" placeholder="5432" />
          </div>
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

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
