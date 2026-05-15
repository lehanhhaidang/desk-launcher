import type { SonioxLanguage } from '@cmt/lib/soniox';

interface SpeakerInfo {
  label: string;
  language: SonioxLanguage;
  number: number;
}

/**
 * SpeakerLabeler — assigns human-readable labels to speaker IDs.
 *
 * Logic:
 * - Each unique speakerId gets "Speaker N" in encounter order.
 * - Language does NOT affect the label or group.
 * - Same speaker always gets same label (first encounter wins).
 */
export class SpeakerLabeler {
  private speakers = new Map<string, SpeakerInfo>();
  private speakerCount = 0;

  /**
   * Get label for a speaker. Creates new mapping if first time.
   */
  getLabel(speakerId: string, language: SonioxLanguage): string {
    const existing = this.speakers.get(speakerId);
    if (existing) return existing.label;

    const number = ++this.speakerCount;
    const label = `Speaker ${number}`;

    this.speakers.set(speakerId, { label, language, number });
    return label;
  }

  /**
   * Get info for a speaker.
   */
  getInfo(speakerId: string): SpeakerInfo | undefined {
    return this.speakers.get(speakerId);
  }

  /**
   * Get the speaker number (1-indexed) for badge color assignment.
   */
  getSpeakerNumber(speakerId: string): number {
    return this.speakers.get(speakerId)?.number ?? 1;
  }

  /**
   * Get full speaker mapping.
   */
  getMapping(): Record<string, { label: string; language: SonioxLanguage }> {
    const result: Record<string, { label: string; language: SonioxLanguage }> = {};
    this.speakers.forEach((info, id) => {
      result[id] = { label: info.label, language: info.language };
    });
    return result;
  }

  /**
   * Reset labeler (for new meeting).
   */
  reset(): void {
    this.speakers.clear();
    this.speakerCount = 0;
  }
}
