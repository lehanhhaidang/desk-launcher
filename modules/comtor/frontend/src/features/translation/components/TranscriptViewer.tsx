import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  FileSpreadsheet,
  Trash2,
  Loader2,
  Download,
} from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { Input } from '@cmt/components/ui/input';
import { useI18n } from '@cmt/lib/i18n';
import { exportToXLSX } from '../helpers/exportTranscript';
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { TranscriptEntryItem } from './TranscriptEntryItem';
import { MeetingSummary } from './MeetingSummary';
import { AudioPlayer } from './AudioPlayer';
import type { SonioxLanguage } from '@cmt/lib/soniox';
import { tauri } from '@cmt/lib/tauri';

interface TranscriptViewerProps {
  meetingId: string;
  meetingTitle: string;
  onBack?: () => void;
}

export function TranscriptViewer({ meetingId, meetingTitle, onBack }: TranscriptViewerProps) {
  const { t } = useI18n();

  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [downloadingAudio, setDownloadingAudio] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const seekToRef = useRef<((ms: number) => void) | null>(null);
  const activeEntryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await tauri.meetings.get(meetingId);
        if (cancelled) return;
        const loaded: TranscriptEntry[] = detail.entries.map((e, i) => ({
          id: e.id ?? `entry-${i + 1}`,
          meetingId,
          speakerId: e.speakerId ?? '0',
          speakerLabel: e.speakerLabel ?? '',
          speakerNumber: e.speakerNumber ?? 1,
          language: (e.language as SonioxLanguage) ?? 'ja',
          originalText: e.originalText,
          translatedText: e.translatedText ?? '',
          startMs: e.startMs,
          endMs: e.endMs,
          confidence: e.confidence ?? 0,
          isReply: !!e.isReply,
          createdAt: new Date().toISOString(),
        }));
        setEntries(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load transcript');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.originalText.toLowerCase().includes(q) ||
        e.translatedText.toLowerCase().includes(q) ||
        e.speakerLabel.toLowerCase().includes(q) ||
        e.language.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await tauri.meetings.saveTranscript(meetingId, []);
      await tauri.audio.delete(meetingId);
      setEntries([]);
      setShowDeleteConfirm(false);
    } catch {
      setError('Failed to delete transcript');
    } finally {
      setDeleting(false);
    }
  }, [meetingId]);

  useEffect(() => {
    activeEntryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentMs]);

  return (
    <div className="flex flex-col gap-2 py-4 lg:gap-4 lg:py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => onBack?.()} className="h-9 w-9 rounded-lg">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{meetingTitle}</h1>
            <span className="text-xs text-muted-foreground">
              {entries.length} {t.meeting.transcript ?? 'entries'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/30 bg-card/40 px-3 py-2 lg:px-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.meeting.searchTranscript ?? 'Search transcript...'}
            className="h-9 rounded-lg pl-9 text-sm"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={downloadingAudio}
          onClick={async () => {
            setDownloadingAudio(true);
            try {
              const exists = await tauri.audio.exists(meetingId);
              if (!exists) return;
              const bytes = await tauri.audio.get(meetingId);
              await tauri.export.xlsx(bytes, `${meetingTitle}.webm`);
            } catch {
              // ignore
            } finally {
              setDownloadingAudio(false);
            }
          }}
          className="gap-1.5 text-xs"
        >
          {downloadingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t.meeting.downloadAudio}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={entries.length === 0}
          onClick={() => exportToXLSX(entries, meetingTitle)}
          className="gap-1.5 text-xs"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t.meeting.exportXLSX}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={entries.length === 0}
          onClick={() => setShowDeleteConfirm(true)}
          className="gap-1.5 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.meeting.deleteTranscript ?? 'Delete'}
        </Button>
      </div>

      <AudioPlayer meetingId={meetingId} meetingTitle={meetingTitle} onTimeUpdate={setCurrentMs} seekRef={seekToRef} />

      {showDeleteConfirm && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="mb-2 text-sm text-destructive">{t.meeting.confirmDelete ?? 'Are you sure? This cannot be undone.'}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t.common.delete}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="min-h-[55vh] resize-y overflow-y-auto rounded-xl border border-border/30 bg-card/40 p-4" style={{ height: '70vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {entries.length === 0 ? (t.meeting.noTranscript ?? 'No transcript') : 'No results found'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => {
              const active = currentMs >= entry.startMs && currentMs < entry.endMs;
              return (
                <div key={entry.id ?? `${entry.startMs}-${entry.speakerId}`} ref={active ? activeEntryRef : null}>
                  <TranscriptEntryItem
                    entry={entry}
                    isActive={active}
                    onSeek={seekToRef.current ? (ms) => seekToRef.current!(ms) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {entries.length > 0 && <MeetingSummary meetingId={meetingId} entries={entries} />}

      <div className="flex items-center justify-between rounded-xl border border-border/30 bg-card/40 px-4 py-2 text-xs text-muted-foreground">
        <span>
          {filtered.length} / {entries.length} entries
        </span>
        <span>
          🇯🇵 {entries.filter((e) => e.language === 'ja').length} • 🇻🇳 {entries.filter((e) => e.language === 'vi').length}
        </span>
      </div>
    </div>
  );
}

export default TranscriptViewer;
