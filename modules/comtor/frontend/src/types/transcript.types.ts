/** Transcript-related types */

export interface TranscriptEntry {
  id: string;
  meetingId: string;
  speakerId: string;
  speakerLabel: string;
  /** 1-indexed speaker number for stable badge color assignment. */
  speakerNumber: number;
  language: 'ja' | 'vi' | 'en' | 'zh' | 'ko';
  originalText: string;
  translatedText: string;
  startMs: number;
  endMs: number;
  confidence: number;
  isReply: boolean;
  createdAt: string;
}

/** Raw token from Soniox WebSocket response */
export interface SonioxToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
  is_final?: boolean;
  speaker?: string;
  language?: string;
  /** Soniox sends 'original' | 'translation' | 'none' (not 'source') */
  translation_status?: 'original' | 'translation' | 'none';
  source_language?: string;
}

/** Soniox WebSocket response */
export interface SonioxResponse {
  tokens: SonioxToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
  finished?: boolean;
}

/** Export format options */
export type ExportFormat = 'csv' | 'xlsx';

/** Export row for CSV/XLSX */
export interface ExportRow {
  time: string;
  speaker: string;
  language: string;
  originalText: string;
  translation: string;
}
