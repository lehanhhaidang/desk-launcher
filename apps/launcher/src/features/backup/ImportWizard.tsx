import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@desk-launcher/ui'
import { applyAppearance, applyBackup, previewBackup, type ModuleResult, type PreviewOut } from './backup-api'

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [pass, setPass] = useState('')
  const [preview, setPreview] = useState<PreviewOut | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<ModuleResult[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    const f = await open({ multiple: false, filters: [{ name: 'Desk Launcher Backup', extensions: ['dlbak'] }] })
    if (typeof f === 'string') { setSrc(f); setPreview(null); setResults(null) }
  }

  const doPreview = async () => {
    if (!src || !pass) return setMsg('Pick a file and enter the passphrase.')
    setBusy(true); setMsg(null)
    try {
      const p = await previewBackup({ srcPath: src, passphrase: pass })
      setPreview(p)
      setPicked(Object.fromEntries(p.modules.map((m) => [m.id, true])))
    } catch {
      setMsg('Wrong passphrase or the file is damaged.')
    } finally { setBusy(false) }
  }

  const apply = async () => {
    if (!src || !preview) return
    setBusy(true); setMsg(null)
    try {
      const selection = preview.modules.filter((m) => picked[m.id]).map((m) => m.id)
      const out = await applyBackup({ srcPath: src, passphrase: pass, selection })
      applyAppearance(out.appearance)
      setResults(out.results)
    } catch (e) {
      setMsg(`Import failed: ${String((e as { message?: string })?.message ?? e)}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Import backup</h3>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={pick}>Choose .dlbak…</Button>
        <span className="truncate text-xs text-muted-foreground">{src ?? 'No file selected'}</span>
      </div>
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
      {!preview && <Button onClick={doPreview} disabled={busy || !src}>Preview</Button>}
      {preview && !results && (
        <>
          <p className="text-xs text-muted-foreground">From app v{preview.appVersion}. Importing replaces each selected module's data (a safety backup is made first).</p>
          <div className="space-y-1">
            {preview.modules.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!picked[m.id]} onChange={(e) => setPicked((s) => ({ ...s, [m.id]: e.target.checked }))} />
                {m.id} <span className="text-xs text-muted-foreground">({m.fileCount} files{m.includeHeavy ? ', full' : ''})</span>
              </label>
            ))}
          </div>
          <Button onClick={apply} disabled={busy}>{busy ? 'Importing…' : 'Import (replace)'}</Button>
        </>
      )}
      {results && (
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.id} className={r.ok ? 'text-emerald-400' : 'text-red-400'}>
              {r.id}: {r.ok ? 'restored' : r.error}
            </li>
          ))}
          <li className="text-xs text-muted-foreground">Reopen module windows to see restored data and theme.</li>
        </ul>
      )}
      {msg && <p className="text-xs text-red-400">{msg}</p>}
      <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
    </div>
  )
}
