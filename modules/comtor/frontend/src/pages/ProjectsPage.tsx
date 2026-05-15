import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { Input } from '@cmt/components/ui/input';
import { Label } from '@cmt/components/ui/label';
import { useI18n } from '@cmt/lib/i18n';
import { tauri, type Project } from '@cmt/lib/tauri';
import type { ViewKey } from '@cmt/components/AppSidebar';

interface ProjectsPageProps {
  onNavigate: (view: ViewKey, params?: { projectId?: string; meetingId?: string }) => void;
}

export function ProjectsPage({ onNavigate }: ProjectsPageProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const list = await tauri.projects.list();
    setProjects(list);
  }, []);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await tauri.projects.create({ name: name.trim(), clientName: clientName.trim() || null, description: description.trim() || null });
      setName('');
      setClientName('');
      setDescription('');
      setCreating(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete project? This will also delete all its meetings.`)) return;
    await tauri.projects.delete(id);
    await reload();
  };

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.dashboard.projects}</h1>
          <p className="text-sm text-muted-foreground">Group your meetings by project.</p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {t.dashboard.newProject}
        </Button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-2xl border border-border/40 bg-card/40 p-5">
          <div className="space-y-2">
            <Label htmlFor="name">{t.dashboard.projectName}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client">{t.dashboard.clientName}</Label>
            <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">{t.dashboard.description}</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreate} disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.common.create}
            </Button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/40 bg-card/20 p-12 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t.dashboard.noProjects}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="group flex items-center justify-between rounded-2xl border border-border/40 bg-card/40 p-5 transition-colors hover:bg-card/70">
              <button
                type="button"
                onClick={() => onNavigate('project', { projectId: p.id })}
                className="flex flex-1 flex-col items-start text-left"
              >
                <p className="text-base font-semibold">{p.name}</p>
                {p.clientName && <p className="text-xs text-muted-foreground">{p.clientName}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.meetingCount ?? 0} {t.dashboard.meetings} • {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(p.id)}
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

export default ProjectsPage;
