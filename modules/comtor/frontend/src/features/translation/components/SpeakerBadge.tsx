
import type { SonioxLanguage } from '@cmt/lib/soniox';

interface SpeakerBadgeProps {
  /** Human-readable label, e.g. "Speaker 1". */
  label: string;
  /** Language of the speaker (kept for future use / tooltip). */
  language: SonioxLanguage;
  /** Raw Soniox speaker ID shown in tooltip on hover. */
  sonioxSpeakerId?: string;
  /**
   * 1-indexed speaker number, used to pick a stable color per person.
   * Defaults to 1 if not provided.
   */
  speakerNumber?: number;
}

/**
 * Color palette for up to 8 distinct speakers.
 * Cycles if there are more than 8 speakers.
 */
const SPEAKER_COLORS: Array<{ bg: string; text: string }> = [
  { bg: 'bg-sky-500/15',     text: 'text-sky-400'     }, // Speaker 1 — sky blue
  { bg: 'bg-violet-500/15',  text: 'text-violet-400'  }, // Speaker 2 — violet
  { bg: 'bg-amber-500/15',   text: 'text-amber-400'   }, // Speaker 3 — amber
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400' }, // Speaker 4 — emerald
  { bg: 'bg-rose-500/15',    text: 'text-rose-400'    }, // Speaker 5 — rose
  { bg: 'bg-cyan-500/15',    text: 'text-cyan-400'    }, // Speaker 6 — cyan
  { bg: 'bg-orange-500/15',  text: 'text-orange-400'  }, // Speaker 7 — orange
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400' }, // Speaker 8 — fuchsia
];

/**
 * SpeakerBadge — colored badge displaying the speaker label.
 *
 * Color is assigned by speaker number (stable per person, not per language).
 * Shows Soniox speaker ID as native tooltip when provided.
 */
export function SpeakerBadge({
  label,
  language,
  sonioxSpeakerId,
  speakerNumber = 1,
}: SpeakerBadgeProps) {
  const colorIdx = (speakerNumber - 1) % SPEAKER_COLORS.length;
  const { bg, text } = SPEAKER_COLORS[colorIdx];
  const tooltip = sonioxSpeakerId
    ? `Soniox ID: ${sonioxSpeakerId} · ${language.toUpperCase()}`
    : undefined;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${bg} ${text}`}
      title={tooltip}
      aria-label={`Speaker: ${label}`}
    >
      {label}
    </span>
  );
}

export default SpeakerBadge;
