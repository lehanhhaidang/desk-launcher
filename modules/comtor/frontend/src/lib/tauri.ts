import { invoke as tauriInvoke } from '@tauri-apps/api/core';

// All Comtor Rust commands live under the `comtor` Tauri plugin, so we
// transparently namespace every call to `plugin:comtor|<cmd>`. Existing
// call sites stay untouched.
function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(`plugin:comtor|${cmd}`, args);
}

// ----- Project types -----
export interface Project {
  id: string;
  name: string;
  description: string | null;
  clientName: string | null;
  createdAt: number;
  updatedAt: number;
  meetingCount: number | null;
}

export interface NewProject {
  name: string;
  description?: string | null;
  clientName?: string | null;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  clientName?: string;
}

// ----- Meeting types -----
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed';
export type MeetingMode = 'standard' | 'private';

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  status: MeetingStatus;
  mode: MeetingMode;
  durationMs: number;
  entryCount: number;
  startedAt: number | null;
  endedAt: number | null;
  audioPath: string | null;
  summary: string | null;
  speakerMapping: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TranscriptEntryDb {
  id?: string | null;
  speakerId?: string | null;
  speakerLabel?: string | null;
  speakerNumber?: number | null;
  language?: string | null;
  originalText: string;
  translatedText?: string | null;
  startMs: number;
  endMs: number;
  confidence?: number | null;
  isReply?: boolean | null;
}

export interface MeetingDetail extends Meeting {
  entries: TranscriptEntryDb[];
}

export interface NewMeeting {
  projectId: string;
  title: string;
  mode?: MeetingMode;
}

export interface MeetingPatch {
  title?: string;
  status?: MeetingStatus;
  mode?: MeetingMode;
  durationMs?: number;
  startedAt?: number;
  endedAt?: number;
  audioPath?: string;
  summary?: string;
  speakerMapping?: string;
}

// ----- Settings types -----
export interface Prefs {
  locale: string;
  lastExportDir: string | null;
  summaryModel: string;
}

export interface SettingsView {
  sonioxKeySet: boolean;
  openaiKeySet: boolean;
  prefs: Prefs;
}

export interface PrefsPatch {
  locale?: string;
  lastExportDir?: string;
  summaryModel?: string;
}

// ----- Wrappers -----
export const tauri = {
  projects: {
    list: () => invoke<Project[]>('list_projects'),
    get: (id: string) => invoke<Project>('get_project', { id }),
    create: (input: NewProject) => invoke<string>('create_project', { input }),
    update: (id: string, patch: ProjectPatch) => invoke<void>('update_project', { id, patch }),
    delete: (id: string) => invoke<void>('delete_project', { id }),
  },
  meetings: {
    list: (projectId: string) => invoke<Meeting[]>('list_meetings', { projectId }),
    listRecent: (limit?: number) => invoke<Meeting[]>('list_recent_meetings', { limit: limit ?? null }),
    get: (id: string) => invoke<MeetingDetail>('get_meeting', { id }),
    create: (input: NewMeeting) => invoke<string>('create_meeting', { input }),
    update: (id: string, patch: MeetingPatch) => invoke<void>('update_meeting', { id, patch }),
    delete: (id: string) => invoke<void>('delete_meeting', { id }),
    saveTranscript: (meetingId: string, entries: TranscriptEntryDb[]) =>
      invoke<number>('save_transcript', { meetingId, entries }),
  },
  audio: {
    save: (meetingId: string, bytes: Uint8Array) =>
      invoke<string>('save_audio', { meetingId, bytes: Array.from(bytes) }),
    get: (meetingId: string) => invoke<number[]>('get_audio', { meetingId }).then((v) => new Uint8Array(v)),
    delete: (meetingId: string) => invoke<void>('delete_audio', { meetingId }),
    exists: (meetingId: string) => invoke<boolean>('audio_exists', { meetingId }),
  },
  settings: {
    get: () => invoke<SettingsView>('get_settings'),
    getSonioxKey: () => invoke<string | null>('get_soniox_key'),
    getOpenaiKey: () => invoke<string | null>('get_openai_key'),
    setSonioxKey: (value: string) => invoke<void>('set_soniox_key', { value }),
    setOpenaiKey: (value: string) => invoke<void>('set_openai_key', { value }),
    clearSonioxKey: () => invoke<void>('clear_soniox_key'),
    clearOpenaiKey: () => invoke<void>('clear_openai_key'),
    getPrefs: () => invoke<Prefs>('get_prefs'),
    setPrefs: (patch: PrefsPatch) => invoke<Prefs>('set_prefs', { patch }),
  },
  export: {
    xlsx: (bytes: Uint8Array, suggestedName: string) =>
      invoke<string | null>('export_xlsx', { bytes: Array.from(bytes), suggestedName }),
  },
};
