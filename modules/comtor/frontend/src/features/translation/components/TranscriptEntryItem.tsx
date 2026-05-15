
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { SpeakerBadge } from './SpeakerBadge';
import { LanguageBadge } from './LanguageBadge';

interface TranscriptEntryItemProps {
  /** Finalized transcript entry to render. */
  entry: TranscriptEntry;
  /** Highlight this entry (audio playback cursor is inside its range). */
  isActive?: boolean;
  /** Seek audio to this entry's start when clicked. */
  onSeek?: (startMs: number) => void;
}

/**
 * Format milliseconds to mm:ss string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * TranscriptEntryItem — renders a single finalized transcript line.
 *
 * Shows:
 * - Language flag badge (🇯🇵 / 🇻🇳)
 * - Speaker badge with color coded by language group
 * - Timestamp
 * - Original text (colored by language)
 * - Translation (when available)
 */
export function TranscriptEntryItem({ entry, isActive, onSeek }: TranscriptEntryItemProps) {
  const isJapanese = entry.language === 'ja';
  const textColor = isJapanese ? 'text-japanese' : 'text-vietnamese';
  const timeStr = formatTime(entry.startMs);

  return (
    <div
      onClick={() => onSeek?.(entry.startMs)}
      className={`group rounded-xl px-4 py-3 transition-colors ${
        isActive
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'hover:bg-background/30 cursor-pointer'
      } ${onSeek ? 'cursor-pointer' : ''}`}
    >
      {/* Speaker header: flag + label + time */}
      <div className="mb-1 flex items-center gap-2">
        <LanguageBadge language={entry.language} />
        <SpeakerBadge
          label={entry.speakerLabel}
          language={entry.language}
          sonioxSpeakerId={entry.speakerId}
          speakerNumber={entry.speakerNumber}
        />
        <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
      </div>

      {/* Original text */}
      <p className={`text-sm font-medium ${textColor}`}>{entry.originalText}</p>

      {/* Translation */}
      {entry.translatedText && (
        <p className="mt-1 text-sm text-muted-foreground">
          → {entry.translatedText}
        </p>
      )}
    </div>
  );
}

export default TranscriptEntryItem;
