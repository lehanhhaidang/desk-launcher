import { useEffect, useState, useCallback } from 'react';
import { ThemeProvider } from '@cmt/components/ThemeProvider';
import { I18nProvider } from '@cmt/lib/i18n';
import { ErrorBoundary } from '@cmt/components/ErrorBoundary';
import { AppSidebar, type ViewKey } from '@cmt/components/AppSidebar';
import { DashboardPage } from '@cmt/pages/DashboardPage';
import { ProjectsPage } from '@cmt/pages/ProjectsPage';
import { ProjectDetailPage } from '@cmt/pages/ProjectDetailPage';
import { MeetingPage } from '@cmt/pages/MeetingPage';
import { SettingsPage } from '@cmt/pages/SettingsPage';
import { VersionPage } from '@cmt/pages/VersionPage';
import { tauri, type SettingsView } from '@cmt/lib/tauri';
import { Loader2 } from 'lucide-react';

interface NavParams {
  projectId?: string;
  meetingId?: string;
}

function AppShell() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [params, setParams] = useState<NavParams>({});
  const [settings, setSettings] = useState<SettingsView | null>(null);

  const refreshSettings = useCallback(async () => {
    const s = await tauri.settings.get();
    setSettings(s);
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      const s = await refreshSettings();
      // First-run gate: if no Soniox key, force Settings.
      if (!s.sonioxKeySet) {
        setView('settings');
      }
    })().catch(console.error);
  }, [refreshSettings]);

  // Re-fetch settings when navigating away from Settings page (so Dashboard knows key is set).
  useEffect(() => {
    if (view !== 'settings') {
      refreshSettings().catch(console.error);
    }
  }, [view, refreshSettings]);

  const handleNavigate = useCallback((next: ViewKey, p?: NavParams) => {
    setView(next);
    setParams(p ?? {});
  }, []);

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar currentView={view} onNavigate={(v) => handleNavigate(v)} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <ErrorBoundary labels={{ title: 'Something went wrong', retry: 'Retry', reload: 'Reload' }}>
            {view === 'dashboard' && (
              <DashboardPage onNavigate={handleNavigate} hasSonioxKey={settings.sonioxKeySet} />
            )}
            {view === 'projects' && <ProjectsPage onNavigate={handleNavigate} />}
            {view === 'project' && params.projectId && (
              <ProjectDetailPage
                projectId={params.projectId}
                hasSonioxKey={settings.sonioxKeySet}
                onNavigate={handleNavigate}
              />
            )}
            {view === 'meeting' && params.meetingId && (
              <MeetingPage meetingId={params.meetingId} projectId={params.projectId} onNavigate={handleNavigate} />
            )}
            {view === 'settings' && <SettingsPage />}
            {view === 'version' && <VersionPage />}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
