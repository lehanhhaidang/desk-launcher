/**
 * Soniox API configuration for real-time speech-to-text and translation.
 * Used by both the backend (temp key generation) and frontend (SDK config).
 */

export const SONIOX_CONFIG = {
  /** Real-time model — stt-rt-v4 (latest, Feb 2026) */
  model: 'stt-rt-v4',

  /** Audio format — 'auto' lets Soniox detect */
  audioFormat: 'auto',

  /** Primary languages for the meeting */
  languageHints: ['ja', 'vi', 'en', 'zh', 'ko'],

  /** Enable speaker diarization to distinguish speakers */
  enableSpeakerDiarization: true,

  /** Enable language identification per token */
  enableLanguageIdentification: true,

  /** Two-way translation between Japanese and Vietnamese */
  translation: {
    type: 'two_way' as const,
    language_a: 'ja',
    language_b: 'vi',
  },
} as const;

/** Soniox REST API base URL for server-side calls */
export const SONIOX_API_URL = 'https://api.soniox.com/v1';

/** Soniox WebSocket endpoint for real-time streaming */
export const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

export type SonioxLanguage = 'ja' | 'vi' | 'en' | 'zh' | 'ko';
