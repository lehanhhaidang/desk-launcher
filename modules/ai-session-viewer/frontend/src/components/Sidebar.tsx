import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Palette } from 'lucide-react'
import { buttonVariants } from '@desk-launcher/ui'
import { AppearanceButton } from '@desk-launcher/theme'
import type { useSessionViewer } from '../hooks/useSessionViewer'
import { ProviderPicker } from './ProviderPicker'
import { ProjectList } from './ProjectList'
import { SessionList } from './SessionList'

type ViewerState = ReturnType<typeof useSessionViewer>

const PROJECTS_MIN = 120
const SESSIONS_MIN = 140

export function Sidebar(state: ViewerState) {
  const [projectsHeight, setProjectsHeight] = useState(260)
  const splitRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startY: 0, startH: 0 })

  function onHandleDown(e: RPointerEvent) {
    drag.current = { active: true, startY: e.clientY, startH: projectsHeight }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandleMove(e: RPointerEvent) {
    if (!drag.current.active) return
    const container = splitRef.current
    const maxH = container
      ? container.clientHeight - SESSIONS_MIN
      : drag.current.startH + 400
    const next = drag.current.startH + (e.clientY - drag.current.startY)
    setProjectsHeight(Math.max(PROJECTS_MIN, Math.min(maxH, next)))
  }

  function onHandleUp(e: RPointerEvent) {
    drag.current.active = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-[var(--text)]">AI Session Viewer</h1>
          <AppearanceButton
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            title="Appearance"
          >
            <Palette className="size-4" />
          </AppearanceButton>
        </div>
        <ProviderPicker
          providers={state.providers}
          providerId={state.providerId}
          basePath={state.basePath}
          loading={state.loading.projects}
          onSelectProvider={state.selectProvider}
          onBasePathChange={state.setBasePath}
          onLoad={state.loadProjects}
        />
      </div>

      <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
        <section
          className="flex flex-col"
          style={{ height: projectsHeight }}
        >
          <SectionTitle>Projects</SectionTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <ProjectList
              projects={state.projects}
              activePath={state.projectPath}
              loading={state.loading.projects}
              onSelect={state.selectProject}
            />
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-2)]"
          title="Drag to resize"
        >
          <span className="h-0.5 w-8 rounded-full bg-[var(--line)] group-hover:bg-[var(--text-muted)]" />
        </div>

        <section className="flex min-h-0 flex-1 flex-col">
          <SectionTitle>Sessions</SectionTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <SessionList
              sessions={state.sessions}
              activePath={state.sessionPath}
              loading={state.loading.sessions}
              onSelect={state.selectSession}
              onRename={state.renameSession}
              onDelete={state.deleteSession}
            />
          </div>
        </section>
      </div>
    </aside>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </h2>
  )
}
