import { useState, useCallback, useRef, useMemo } from 'react';
import type { TranscriptEntry } from '@cmt/types/transcript.types';
import { SpeakerLabeler } from '../helpers/speakerLabeler';
import type { SonioxLanguage } from '@cmt/lib/soniox';
import { tauri, type TranscriptEntryDb } from '@cmt/lib/tauri';

/**
 * useTranscript — manages transcript entries, speaker labeling, and local SQLite persistence.
 */
export function useTranscript(meetingId: string) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const labelerRef = useRef(new SpeakerLabeler());
  const entryIdRef = useRef(0);
  const entriesRef = useRef<TranscriptEntry[]>([]);

  const addEntry = useCallback(
    (
      speakerId: string,
      language: SonioxLanguage,
      originalText: string,
      translatedText: string,
      startMs: number,
      endMs: number,
      confidence: number
    ) => {
      const label = labelerRef.current.getLabel(speakerId, language);
      const speakerNumber = labelerRef.current.getSpeakerNumber(speakerId);
      const entry: TranscriptEntry = {
        id: `entry-${++entryIdRef.current}`,
        meetingId,
        speakerId,
        speakerLabel: label,
        speakerNumber,
        language,
        originalText,
        translatedText,
        startMs,
        endMs,
        confidence,
        isReply: false,
        createdAt: new Date().toISOString(),
      };

      setEntries((prev) => {
        const next = [...prev, entry];
        entriesRef.current = next;
        return next;
      });
      return entry;
    },
    [meetingId]
  );

  const updateInterim = useCallback(
    (text: string, speakerId: string, language: SonioxLanguage) => {
      setCurrentText(text);
      setCurrentSpeaker(labelerRef.current.getLabel(speakerId, language));
    },
    []
  );

  const updateLastTranslation = useCallback((translatedText: string) => {
    setEntries((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.translatedText) return prev;
      const next = [...prev.slice(0, -1), { ...last, translatedText }];
      entriesRef.current = next;
      return next;
    });
  }, []);

  const clearInterim = useCallback(() => {
    setCurrentText('');
    setCurrentSpeaker('');
  }, []);

  const getSpeakerMapping = useCallback(() => {
    return labelerRef.current.getMapping();
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    entriesRef.current = [];
    setCurrentText('');
    setCurrentSpeaker('');
    labelerRef.current.reset();
    entryIdRef.current = 0;
  }, []);

  /**
   * Persist all entries to SQLite via Tauri (plaintext, no encryption).
   */
  const saveToServer = useCallback(async (): Promise<number> => {
    const currentEntries = entriesRef.current;
    if (currentEntries.length === 0) return 0;

    const dbEntries: TranscriptEntryDb[] = currentEntries.map((entry) => ({
      id: entry.id,
      speakerId: entry.speakerId,
      speakerLabel: entry.speakerLabel,
      speakerNumber: entry.speakerNumber,
      language: entry.language,
      originalText: entry.originalText,
      translatedText: entry.translatedText ?? null,
      startMs: entry.startMs,
      endMs: entry.endMs,
      confidence: entry.confidence,
      isReply: entry.isReply,
    }));

    return await tauri.meetings.saveTranscript(meetingId, dbEntries);
  }, [meetingId]);

  /**
   * Load saved transcript from SQLite (used in viewer mode).
   */
  const loadFromDb = useCallback(async () => {
    const detail = await tauri.meetings.get(meetingId);
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
    entriesRef.current = loaded;
    setEntries(loaded);
    entryIdRef.current = loaded.length;
  }, [meetingId]);

  return useMemo(
    () => ({
      entries,
      currentText,
      currentSpeaker,
      addEntry,
      updateLastTranslation,
      updateInterim,
      clearInterim,
      getSpeakerMapping,
      reset,
      saveToServer,
      loadFromDb,
    }),
    [
      entries,
      currentText,
      currentSpeaker,
      addEntry,
      updateLastTranslation,
      updateInterim,
      clearInterim,
      getSpeakerMapping,
      reset,
      saveToServer,
      loadFromDb,
    ]
  );
}
