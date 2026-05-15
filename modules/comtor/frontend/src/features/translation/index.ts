/**
 * Translation feature — public API barrel.
 * Import components and hooks from here instead of deep paths.
 */

// Components
export { MeetingRoom } from './components/MeetingRoom';
export { MeetingControls } from './components/MeetingControls';
export { TranscriptPanel } from './components/TranscriptPanel';
export { TranscriptEntryItem, formatTime } from './components/TranscriptEntryItem';
export { SpeakerBadge } from './components/SpeakerBadge';
export { LanguageBadge } from './components/LanguageBadge';

// Hooks
export { useSonioxRealtime } from './hooks/useSonioxRealtime';
export { useTranscript } from './hooks/useTranscript';
export { useSpeakerMapping } from './hooks/useSpeakerMapping';
export type { SpeakerMapping, SpeakerMappingEntry } from './hooks/useSpeakerMapping';

// Helpers
export { SpeakerLabeler } from './helpers/speakerLabeler';
