import { useEffect, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { Button } from '@desk-launcher/ui'
import {
  createHost,
  updateHost,
  type AuthMethod,
  type Group,
  type Host,
  type HostInput,
} from '../api/myssh-api'

interface Props {
  open: boolean
  host: Host | null
  groups: Group[]
  hosts: Host[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  label: string
  hostname: string
  port: string
  username: string
  groupId: string
  authMethod: AuthMethod
  keyPath: string
  secret: string
  jumpHostId: string
  tags: string
}

function emptyForm(): FormState {
  return {
    label: '',
    hostname: '',
    port: '22',
    username: '',
    groupId: '',
    authMethod: 'password',
    keyPath: '',
    secret: '',
    jumpHostId: '',
    tags: '',
  }
}

function formFromHost(host: Host): FormState {
  return {
    label: host.label,
    hostname: host.hostname,
    port: String(host.port),
    username: host.username,
    groupId: host.groupId ?? '',
    authMethod: host.authMethod,
    keyPath: host.keyPath ?? '',
    secret: '',
    jumpHostId: host.jumpHostId ?? '',
    tags: host.tags.join(', '),
  }
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#edf3f7] outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.06]'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9aa6b6]'

export function HostDialog({ open, host, groups, hosts, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(host ? formFromHost(host) : emptyForm())
  }, [open, host])

  if (!open) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const browseKey = async () => {
    const picked = await openFileDialog({ multiple: false, directory: false, title: 'Select SSH key' })
    if (typeof picked === 'string') set('keyPath', picked)
  }

  const save = async () => {
    const port = Number(form.port)
    if (!form.label.trim()) return toast.error('Label is required')
    if (!form.hostname.trim()) return toast.error('Host is required')
    if (!form.username.trim()) return toast.error('Username is required')
    if (!Number.isInteger(port) || port < 1 || port > 65535) return toast.error('Port must be 1–65535')

    const input: HostInput = {
      label: form.label.trim(),
      hostname: form.hostname.trim(),
      port,
      username: form.username.trim(),
      groupId: form.groupId || null,
      authMethod: form.authMethod,
      keyPath: form.authMethod === 'key' ? form.keyPath.trim() || null : null,
      secret: form.secret ? form.secret : null,
      jumpHostId: form.jumpHostId || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    setSaving(true)
    try {
      if (host) await updateHost(host.id, input)
      else await createHost(input)
      toast.success(host ? 'Host updated' : 'Host created')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(`Save failed: ${errMessage(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="myssh-panel w-full max-w-lg rounded-xl border p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-[#edf3f7]">
          {host ? 'Edit host' : 'New host'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Label</label>
            <input
              className={inputClass}
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Production web"
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>Host</label>
            <input
              className={inputClass}
              value={form.hostname}
              onChange={(e) => set('hostname', e.target.value)}
              placeholder="192.168.1.10"
            />
          </div>
          <div>
            <label className={labelClass}>Port</label>
            <input
              className={inputClass}
              value={form.port}
              onChange={(e) => set('port', e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              className={inputClass}
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="root"
            />
          </div>
          <div>
            <label className={labelClass}>Group</label>
            <select
              className={inputClass}
              value={form.groupId}
              onChange={(e) => set('groupId', e.target.value)}
            >
              <option value="">Ungrouped</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Auth method</label>
            <select
              className={inputClass}
              value={form.authMethod}
              onChange={(e) => set('authMethod', e.target.value as AuthMethod)}
            >
              <option value="password">Password</option>
              <option value="key">SSH key</option>
              <option value="agent">SSH agent</option>
            </select>
          </div>
          {form.authMethod !== 'agent' && (
            <div>
              <label className={labelClass}>
                {form.authMethod === 'key' ? 'Key passphrase' : 'Password'}
              </label>
              <input
                type="password"
                className={inputClass}
                value={form.secret}
                onChange={(e) => set('secret', e.target.value)}
                placeholder={host?.hasSecret ? '•••••• (unchanged)' : ''}
              />
            </div>
          )}

          {form.authMethod === 'key' && (
            <div className="col-span-2">
              <label className={labelClass}>Key file</label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={form.keyPath}
                  onChange={(e) => set('keyPath', e.target.value)}
                  placeholder="C:\\Users\\you\\.ssh\\id_ed25519"
                />
                <Button type="button" variant="secondary" onClick={browseKey}>
                  Browse
                </Button>
              </div>
            </div>
          )}

          <div className="col-span-2">
            <label className={labelClass}>Tags (comma separated)</label>
            <input
              className={inputClass}
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="prod, db"
            />
          </div>

          <div className="col-span-2">
            <label className={labelClass}>Jump host (ProxyJump, optional)</label>
            <select
              className={inputClass}
              value={form.jumpHostId}
              onChange={(e) => set('jumpHostId', e.target.value)}
            >
              <option value="">None — connect directly</option>
              {hosts
                .filter((h) => h.id !== host?.id)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : host ? 'Save changes' : 'Create host'}
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
