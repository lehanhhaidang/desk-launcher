// Reveal a file (or its parent folder) in the OS file explorer through Tauri's
// opener plugin. Falls back to a console warning when running outside Tauri so
// dev-server previews don't crash.

const TAURI_INTERNALS = '__TAURI_INTERNALS__'

function inTauri(): boolean {
  return typeof window !== 'undefined' && TAURI_INTERNALS in window
}

export async function revealInFolder(path: string): Promise<void> {
  if (!inTauri()) {
    console.warn('revealInFolder requires Tauri context:', path)
    return
  }
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}

export async function openPath(path: string): Promise<void> {
  if (!inTauri()) {
    console.warn('openPath requires Tauri context:', path)
    return
  }
  const { openPath: open } = await import('@tauri-apps/plugin-opener')
  await open(path)
}
