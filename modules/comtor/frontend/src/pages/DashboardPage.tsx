import { useEffect, useState } from 'react';
import { FolderOpen, Mic, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { useI18n } from '@cmt/lib/i18n';
import { tauri, type Project, type Meeting } from '@cmt/lib/tauri';
import type { ViewKey } from '@cmt/components/AppSidebar';

interface DashboardPageProps {
  onNavigate: (view: ViewKey, params?: { projectId?: string; meetingId?: string }) => void;
  hasSonioxKey: boolean;
}

export function DashboardPage({ onNavigate, hasSonioxKey }: DashboardPageProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recent, setRecent] = useState<Meeting[]>([]);

  useEffect(() => {
    (async () => {
      const [p, m] = await Promise.all([
        tauri.projects.list(),
        tauri.meetings.listRecent(5),
      ]);
      setProjects(p);
      setRecent(m);
    })().catch(console.error);
  }, []);

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">{t.common.appName}</h1>
        <p className="text-sm text-muted-foreground">
          Real-time JP ↔ VN meeting translator. Local-first, offline storage.
        </p>
      </div>

      {!hasSonioxKey && (
        <div className="flex items-center justify-between rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm font-medium">Soniox API key not set</p>
              <p className="text-xs text-muted-foreground">Add it in Settings to start recording meetings.</p>
            </div>
          </div>
          <Button onClick={() => onNavigate('settings')}>{t.settings.title}</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onNavigate('projects')}
          className="rounded-2xl border border-border/40 bg-card/40 p-5 text-left transition-colors hover:bg-card/70"
        >
          <FolderOpen className="mb-3 h-6 w-6 text-primary" />
          <p className="text-2xl font-bold">{projects.length}</p>
          <p className="text-sm text-muted-foreground">{t.dashboard.projects}</p>
        </button>
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <Mic className="mb-3 h-6 w-6 text-primary" />
          <p className="text-2xl font-bold">{recent.length}</p>
          <p className="text-sm text-muted-foreground">Recent {t.dashboard.meetings}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <Sparkles className="mb-3 h-6 w-6 text-primary" />
          <p className="text-2xl font-bold">{recent.filter((m) => m.summary).length}</p>
          <p className="text-sm text-muted-foreground">With AI summary</p>
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Recent meetings</h2>
          <div className="space-y-2">
            {recent.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onNavigate('meeting', { meetingId: m.id })}
                className="flex w-full items-center justify-between rounded-xl border border-border/30 bg-card/40 px-4 py-3 text-left transition-colors hover:bg-card/70"
              >
                <div>
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString()} • {m.entryCount} entries
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.status === 'completed' ? 'bg-vietnamese/15 text-vietnamese' : 'bg-yellow-500/15 text-yellow-500'}`}>
                  {m.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
