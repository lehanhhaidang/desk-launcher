import { useEffect, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { Button } from '@desk-launcher/ui'
import { backupPlan, exportBackup, gatherAppearance, type ModulePlan } from './backup-api'

export function ExportWizard({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<ModulePlan[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [heavy, setHeavy] = useState<Record<string, boolean>>({})
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    backupPlan().then((p) => {
      setPlans(p)
      const all: Record<string, boolean> = {}
      const h: Record<string, boolean> = {}
      for (const m of p) { all[m.id] = true; if (m.heavyLabel) h[m.id] = true }
      setPicked(all); setHeavy(h)
    })
  }, [])

  const run = async () => {
    setMsg(null)
    if (!pass) return setMsg('Enter a passphrase.')
    if (pass !== confirm) return setMsg('Passphrases do not match.')
    const dest = await save({ title: 'Save backup', defaultPath: 'desk-launcher-backup.dlbak', filters: [{ name: 'Desk Launcher Backup', extensions: ['dlbak'] }] })
    if (!dest) return
    setBusy(true)
    try {
      const selection = plans.filter((m) => picked[m.id]).map((m) => ({ id: m.id, includeHeavy: !!heavy[m.id] }))
      await exportBackup({ selection, appearance: gatherAppearance(), passphrase: pass, destPath: dest })
      setMsg(`Saved to ${dest}`)
    } catch (e) {
      setMsg(`Export failed: ${String((e as { message?: string })?.message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Export backup</h3>
      <div className="space-y-2">
        {plans.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={!!picked[m.id]} onChange={(e) => setPicked((s) => ({ ...s, [m.id]: e.target.checked }))} />
              {m.label}
            </span>
            {m.heavyLabel && picked[m.id] && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!heavy[m.id]} onChange={(e) => setHeavy((s) => ({ ...s, [m.id]: e.target.checked }))} />
                {m.heavyLabel}
              </span>
            )}
          </label>
        ))}
      </div>
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Confirm passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={run} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</Button>
      </div>
    </div>
  )
}
