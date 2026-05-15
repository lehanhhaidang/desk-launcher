
import { useEffect, useRef, memo } from 'react';
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { useI18n } from '@cmt/lib/i18n';
import { TranscriptEntryItem } from './TranscriptEntryItem';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  currentText: string;
  currentSpeaker: string;
  /** Current audio playback position in ms — highlights active entry */
  currentMs?: number;
  /** Seek audio to entry startMs when clicked */
  onSeek?: (startMs: number) => void;
}

/**
 * TranscriptPanel — scrollable transcript with auto-scroll.
 * Renders finalized entries via TranscriptEntryItem + live interim text.
 */
export const TranscriptPanel = memo(function TranscriptPanel({
  entries,
  currentText,
  currentSpeaker,
  currentMs = 0,
  onSeek,
}: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const { t } = useI18n();

  // Auto-scroll to bottom on new entries or interim updates (live recording)
  useEffect(() => {
    if (!onSeek) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, currentText, onSeek]);

  // Auto-scroll active entry into view during playback
  useEffect(() => {
    if (onSeek && currentMs > 0) {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentMs, onSeek]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/95">
      {/* Header */}
      <div className="border-b border-border/30 px-5 py-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t.meeting.transcript}
        </h2>
      </div>

      {/* Entries */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {entries.length === 0 && !currentText && (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground/50">
            <p>{t.meeting.waitingForSpeech}</p>
          </div>
        )}

        {entries.map((entry) => {
          const isActive = onSeek != null && currentMs >= entry.startMs && currentMs < entry.endMs;
          return (
            <div key={entry.id} ref={isActive ? activeRef : null}>
              <TranscriptEntryItem
                entry={entry}
                isActive={isActive}
                onSeek={onSeek}
              />
            </div>
          );
        })}

        {/* Interim (partial) text */}
        {currentText && (
          <div className="animate-pulse rounded-xl border border-border/20 bg-background/30 px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {currentSpeaker || '...'}
              </span>
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{currentText}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
});

export default TranscriptPanel;

