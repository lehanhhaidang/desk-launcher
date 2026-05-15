import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tauri, type MeetingDetail } from '@cmt/lib/tauri';
import { MeetingRoom } from '@cmt/features/translation/components/MeetingRoom';
import { TranscriptViewer } from '@cmt/features/translation/components/TranscriptViewer';
import type { ViewKey } from '@cmt/components/AppSidebar';

interface MeetingPageProps {
  meetingId: string;
  projectId?: string;
  onNavigate: (view: ViewKey, params?: { projectId?: string; meetingId?: string }) => void;
}

export function MeetingPage({ meetingId, projectId, onNavigate }: MeetingPageProps) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await tauri.meetings.get(meetingId);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load meeting');
      }
    })();
    return () => { cancelled = true; };
  }, [meetingId]);

  const handleBack = () => {
    onNavigate(projectId ? 'project' : 'projects', projectId ? { projectId } : undefined);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.status === 'completed' && detail.mode === 'standard') {
    return <TranscriptViewer meetingId={meetingId} meetingTitle={detail.title} onBack={handleBack} />;
  }

  return (
    <MeetingRoom
      meetingId={meetingId}
      meetingTitle={detail.title}
      projectId={detail.projectId}
      mode={detail.mode}
      onBack={handleBack}
    />
  );
}

export default MeetingPage;
