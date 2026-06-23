import type { ReactNode } from 'react'
import { Palette } from 'lucide-react'
import { buttonVariants } from '@desk-launcher/ui'
import { AppearanceButton } from '@desk-launcher/theme'
import type { useSessionViewer } from '../hooks/useSessionViewer'
import { ProviderPicker } from './ProviderPicker'
import { ProjectList } from './ProjectList'
import { SessionList } from './SessionList'

type ViewerState = ReturnType<typeof useSessionViewer>

export function Sidebar(state: ViewerState) {
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

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col border-b border-[var(--line)]">
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

        <section className="flex min-h-0 flex-1 flex-col">
          <SectionTitle>Sessions</SectionTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <SessionList
              sessions={state.sessions}
              activePath={state.sessionPath}
              loading={state.loading.sessions}
              onSelect={state.selectSession}
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
