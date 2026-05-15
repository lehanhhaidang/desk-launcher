import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Pin,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { useI18n } from '@cmt/lib/i18n';
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { tauri } from '@cmt/lib/tauri';
import { generateMeetingSummary, type MeetingSummaryData } from '@cmt/services/openai.service';

interface MeetingSummaryProps {
  meetingId: string;
  entries: TranscriptEntry[];
}

export function MeetingSummary({ meetingId, entries }: MeetingSummaryProps) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<MeetingSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);

  // Load existing summary + check OpenAI key
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await tauri.settings.get();
        if (cancelled) return;
        setHasOpenaiKey(settings.openaiKeySet);

        const detail = await tauri.meetings.get(meetingId);
        if (cancelled) return;
        if (detail.summary) {
          try {
            const parsed: MeetingSummaryData = JSON.parse(detail.summary);
            setData(parsed);
          } catch {
            // Old/legacy summary in plain text — display as-is
            setData({ summary: detail.summary, keyPoints: [], actionItems: [] });
          }
        }
      } catch (err) {
        console.error('[MeetingSummary] load error:', err);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const handleGenerate = useCallback(async () => {
    if (entries.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const apiKey = await tauri.settings.getOpenaiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured. Add it in Settings.');
      }

      const transcript = entries
        .map((e) => `[${e.speakerLabel}] ${e.originalText}${e.translatedText ? ` (${e.translatedText})` : ''}`)
        .join('\n');

      const prefs = await tauri.settings.getPrefs();
      const summaryData = await generateMeetingSummary(transcript, locale, apiKey, prefs.summaryModel);

      await tauri.meetings.update(meetingId, { summary: JSON.stringify(summaryData) });
      setData(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }, [meetingId, entries, locale]);

  if (entries.length === 0) return null;

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="rounded-2xl border border-border/30 bg-card/40 p-6">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Sparkles className="h-8 w-8 text-primary/50" />
          <p className="text-sm text-muted-foreground">
            {t.meeting.generateSummaryHint ?? 'Use AI to generate a meeting summary'}
          </p>
          <Button
            onClick={handleGenerate}
            disabled={!hasOpenaiKey}
            className="gap-2 rounded-xl"
          >
            <Sparkles className="h-4 w-4" />
            {t.meeting.generateSummary ?? 'Generate Summary'}
          </Button>
          {!hasOpenaiKey && (
            <p className="text-xs text-muted-foreground">Add an OpenAI API key in Settings to enable summaries.</p>
          )}
          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/30 bg-card/40 p-6">
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {t.meeting.generatingSummary ?? 'Generating summary...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/30 bg-card/40 p-5 lg:p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          {t.meeting.summary ?? 'Meeting Summary'}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGenerate}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t.meeting.regenerateSummary ?? 'Regenerate'}
        </Button>
      </div>

      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{data!.summary}</p>

      {data!.keyPoints.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Pin className="h-3.5 w-3.5 text-primary" />
            {t.meeting.keyPoints ?? 'Key Points'}
          </h3>
          <ul className="space-y-1.5">
            {data!.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data!.actionItems.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5 text-vietnamese" />
            {t.meeting.actionItems ?? 'Action Items'}
          </h3>
          <ul className="space-y-1.5">
            {data!.actionItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-1 shrink-0">☐</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
    </div>
  );
}

export default MeetingSummary;
