import { useSessionViewer } from './hooks/useSessionViewer'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'

export default function AiSessionViewer() {
  const state = useSessionViewer()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <Sidebar {...state} />

      <main className="flex min-w-0 flex-1 flex-col">
        {state.error && (
          <div className="border-b border-[var(--line)] bg-[var(--brand)]/10 px-5 py-2 text-xs text-[var(--text)]">
            {state.error}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <ChatView
            session={state.activeSession}
            messages={state.messages}
            loading={state.loading.messages}
            onRefresh={state.refreshActiveSession}
          />
        </div>
      </main>
    </div>
  )
}
