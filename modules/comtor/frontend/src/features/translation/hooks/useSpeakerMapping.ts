
import { useRef, useCallback } from 'react';
import { SpeakerLabeler } from '../helpers/speakerLabeler';
import type { SonioxLanguage } from '@cmt/lib/soniox';

/** Speaker label + language pair returned by getMapping. */
export interface SpeakerMappingEntry {
  label: string;
  language: SonioxLanguage;
}

/** Full mapping from Soniox speaker ID → label + language. */
export type SpeakerMapping = Record<string, SpeakerMappingEntry>;

/**
 * useSpeakerMapping — manages speaker label assignments via SpeakerLabeler.
 *
 * Provides stable callbacks for:
 * - Resolving a speaker label (auto-assigns on first encounter)
 * - Reading current mapping (for persistence)
 * - Resetting on new meeting
 */
export function useSpeakerMapping() {
  const labelerRef = useRef(new SpeakerLabeler());

  /**
   * Get (or create) the human-readable label for a speaker.
   * First call with a given speakerId determines their group (ja → Customer, vi → Our).
   */
  const getLabel = useCallback(
    (speakerId: string, language: SonioxLanguage): string => {
      return labelerRef.current.getLabel(speakerId, language);
    },
    []
  );

  /**
   * Get the full current speaker mapping (for saving to meeting record).
   */
  const getMapping = useCallback((): SpeakerMapping => {
    return labelerRef.current.getMapping();
  }, []);

  /**
   * Reset all speaker assignments (call at the start of a new meeting).
   */
  const reset = useCallback((): void => {
    labelerRef.current.reset();
  }, []);

  return { getLabel, getMapping, reset };
}
