import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Mic, Plus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { Input } from '@cmt/components/ui/input';
import { Label } from '@cmt/components/ui/label';
import { useI18n } from '@cmt/lib/i18n';
import { tauri, type Meeting, type Project, type MeetingMode } from '@cmt/lib/tauri';
import type { ViewKey } from '@cmt/components/AppSidebar';

interface ProjectDetailPageProps {
  projectId: string;
  hasSonioxKey: boolean;
  onNavigate: (view: ViewKey, params?: { projectId?: string; meetingId?: string }) => void;
}

export function ProjectDetailPage({ projectId, hasSonioxKey, onNavigate }: ProjectDetailPageProps) {
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<MeetingMode>('standard');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [p, m] = await Promise.all([tauri.projects.get(projectId), tauri.meetings.list(projectId)]);
    setProject(p);
    setMeetings(m);
  }, [projectId]);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const id = await tauri.meetings.create({ projectId, title: title.trim(), mode });
      setTitle('');
      setCreating(false);
      onNavigate('meeting', { meetingId: id, projectId });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this meeting?')) return;
    await tauri.meetings.delete(id);
    await tauri.audio.delete(id).catch(() => {});
    await reload();
  };

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => onNavigate('projects')} className="h-9 w-9 rounded-lg">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{project?.name ?? '...'}</h1>
            {project?.clientName && <p className="text-sm text-muted-foreground">{project.clientName}</p>}
          </div>
        </div>
        <Button disabled={!hasSonioxKey} onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {t.dashboard.newMeeting}
        </Button>
      </div>

      {!hasSonioxKey && (
        <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-500">
          Add a Soniox API key in Settings before creating meetings.
        </p>
      )}

      {creating && (
        <div className="space-y-3 rounded-2xl border border-border/40 bg-card/40 p-5">
          <div className="space-y-2">
            <Label htmlFor="title">{t.dashboard.meetingTitle}</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>{t.meeting.meetingMode ?? 'Mode'}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'standard' ? 'default' : 'outline'}
                onClick={() => setMode('standard')}
              >
                {t.meeting.modeStandard ?? 'Standard'}
              </Button>
              <Button
                type="button"
                variant={mode === 'private' ? 'default' : 'outline'}
                onClick={() => setMode('private')}
              >
                {t.meeting.modePrivate ?? 'Private'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'standard'
                ? (t.meeting.modeStandardDesc ?? 'Saves transcript and audio locally.')
                : (t.meeting.modePrivateDesc ?? 'Discards data after the meeting ends.')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreate} disabled={busy || !title.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.common.create}
            </Button>
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/40 bg-card/20 p-12 text-center">
          <Mic className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t.dashboard.noMeetings}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="group flex items-center justify-between rounded-xl border border-border/30 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70">
              <button
                type="button"
                onClick={() => onNavigate('meeting', { meetingId: m.id, projectId })}
                className="flex flex-1 flex-col items-start text-left"
              >
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()} • {m.entryCount} entries • {m.mode}
                </p>
              </button>
              <span className={`mr-3 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.status === 'completed' ? 'bg-vietnamese/15 text-vietnamese' : 'bg-yellow-500/15 text-yellow-500'}`}>
                {m.status}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(m.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProjectDetailPage;
