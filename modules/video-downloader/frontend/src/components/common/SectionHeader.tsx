import type { ReactNode } from 'react'

interface SectionHeaderProps {
  label: string
  title: string
  actions?: ReactNode
}

export function SectionHeader({ label, title, actions }: SectionHeaderProps) {
  return (
    <section className="vd-workflow-header">
      <div className="min-w-0">
        <p className="vd-section-label">{label}</p>
        <h2 className="truncate">{title}</h2>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </section>
  )
}
