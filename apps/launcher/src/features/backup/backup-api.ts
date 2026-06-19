import { invoke } from '@tauri-apps/api/core'

export interface ModulePlan { id: string; label: string; heavyLabel: string | null }
export interface ModuleSel { id: string; includeHeavy: boolean }
export interface PreviewModule { id: string; includeHeavy: boolean; fileCount: number }
export interface PreviewOut { version: number; appVersion: string; createdAtMs: number; modules: PreviewModule[] }
export interface ModuleResult { id: string; ok: boolean; error: string | null }
export interface ApplyOut { results: ModuleResult[]; appearance: Record<string, string> | null }

export const backupPlan = () => invoke<ModulePlan[]>('backup_plan')

export const exportBackup = (req: {
  selection: ModuleSel[]; appearance: Record<string, string>; passphrase: string; destPath: string
}) => invoke<string>('backup_export', { req })

export const previewBackup = (req: { srcPath: string; passphrase: string }) =>
  invoke<PreviewOut>('backup_preview', { req })

export const applyBackup = (req: { srcPath: string; passphrase: string; selection: string[] }) =>
  invoke<ApplyOut>('backup_import_apply', { req })

/** Snapshot every app's saved theme from the shared localStorage origin. */
export function gatherAppearance(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('theme:')) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

/** Write an imported appearance snapshot back to localStorage. */
export function applyAppearance(obj: Record<string, string> | null): void {
  if (!obj) return
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('theme:')) localStorage.setItem(k, v)
  }
}
