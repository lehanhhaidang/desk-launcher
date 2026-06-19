import { useState } from 'react'
import { ExportWizard } from './ExportWizard'
import { ImportWizard } from './ImportWizard'

export function BackupPanel() {
  const [tab, setTab] = useState<'export' | 'import'>('export')
  return (
    <section className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button className={tab === 'export' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setTab('export')}>Export</button>
        <button className={tab === 'import' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setTab('import')}>Import</button>
      </div>
      {tab === 'export' ? <ExportWizard onClose={() => {}} /> : <ImportWizard onClose={() => {}} />}
    </section>
  )
}
