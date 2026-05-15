import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Wifi, WifiOff, AlertCircle, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { useI18n } from '@cmt/lib/i18n';
import { useSonioxRealtime } from '../hooks/useSonioxRealtime';
import { useTranscript } from '../hooks/useTranscript';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { exportToXLSX } from '../helpers/exportTranscript';
import { TranscriptPanel } from './TranscriptPanel';
import { MeetingControls } from './MeetingControls';
import { MeetingSummary } from './MeetingSummary';
import { AudioPlayer } from './AudioPlayer';
import { tauri } from '@cmt/lib/tauri';

interface MeetingRoomProps {
  meetingId: string;
  meetingTitle: string;
  projectId?: string;
  mode?: 'standard' | 'private';
  onBack?: () => void;
}

const STATUS_COLORS = {
  disconnected: 'text-muted-foreground',
  connecting: 'text-yellow-500',
  connected: 'text-vietnamese',
  error: 'text-destructive',
} as const;

/**
 * MeetingRoom — main translation interface.
 * Composes MeetingControls + TranscriptPanel with Soniox real-time STT.
 */
export function MeetingRoom({ meetingId, meetingTitle, mode = 'standard', onBack }: MeetingRoomProps) {
  const { t } = useI18n();
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [error, setError] = useState('');
  const [currentMs, setCurrentMs] = useState(0);
  const seekToRef = useRef<((ms: number) => void) | null>(null);

  const transcript = useTranscript(meetingId);
  const { isRecording, duration, hasRecording, startRecording, stopRecording, downloadRecording, waitForBlob } = useAudioRecorder();

  const soniox = useSonioxRealtime({
    onFinalTokens: transcript.addEntry,
    onInterimTokens: transcript.updateInterim,
    onTranslationOnly: transcript.updateLastTranslation,
    onError: (err) => setError(err),
  });

  const statusLabels = useMemo(() => ({
    disconnected: t.meeting.disconnected,
    connecting: t.meeting.connecting,
    connected: t.meeting.connected,
    error: t.common.error,
  }), [t]);

  const handleStart = useCallback(async () => {
    setError('');
    setIsActive(true);
    await soniox.start();
  }, [soniox]);

  useEffect(() => {
    if (isActive && soniox.stream && !isRecording) {
      startRecording(soniox.stream);
    }
  }, [isActive, soniox.stream, isRecording, startRecording]);

  const handlePause = useCallback(() => {
    soniox.stop();
    setIsPaused(true);
  }, [soniox]);

  const handleResume = useCallback(async () => {
    setIsPaused(false);
    await soniox.start();
  }, [soniox]);

  /**
   * Stop meeting — stop transcription/recording, save transcript + audio (plaintext), update status.
   */
  const handleStop = useCallback(async () => {
    soniox.stop();
    stopRecording();
    transcript.clearInterim();
    setIsActive(false);

    if (mode === 'standard') {
      try {
        await transcript.saveToServer();

        const blob = await waitForBlob();
        if (blob && blob.size > 0) {
          const arrayBuffer = await blob.arrayBuffer();
          const audioPath = await tauri.audio.save(meetingId, new Uint8Array(arrayBuffer));
          await tauri.meetings.update(meetingId, { audioPath });
        }
      } catch (err) {
        console.error('[MeetingRoom] save error:', err);
        setError('Failed to save meeting data.');
      }
    }

    await tauri.meetings.update(meetingId, {
      status: 'completed',
      endedAt: Date.now(),
    });
    setIsEnded(true);
  }, [meetingId, soniox, stopRecording, waitForBlob, transcript, mode]);

  const handleBack = useCallback(() => {
    if (isActive) {
      if (!confirm(t.meeting.confirmLeave)) return;
      soniox.stop();
    }
    onBack?.();
  }, [isActive, soniox, onBack, t]);

  return (
    <div className="flex h-[100dvh] flex-col gap-2 lg:h-[calc(100vh-4rem)] lg:gap-4">
      {/* Top bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <h1 className="text-lg font-bold">{meetingTitle}</h1>
            <span className={`flex items-center gap-1 text-xs ${STATUS_COLORS[soniox.state]}`}>
              {soniox.state === 'connected' ? (
                <Wifi className="h-3 w-3" />
              ) : soniox.state === 'error' ? (
                <AlertCircle className="h-3 w-3" />
              ) : soniox.state === 'connecting' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {statusLabels[soniox.state]}
            </span>
          </div>
        </div>

        <MeetingControls
          isActive={isActive}
          isPaused={isPaused}
          isEnded={isEnded}
          connectionState={soniox.state}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      {(isActive || hasRecording || transcript.entries.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/30 bg-card/40 px-3 py-2 lg:px-4">
          {isRecording && (
            <span className="mr-2 text-xs font-medium text-destructive">
              ⏱ {String(Math.floor(duration / 60)).padStart(2, '0')}:
              {String(duration % 60).padStart(2, '0')}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={!hasRecording}
            onClick={() => downloadRecording(meetingTitle)}
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            {t.meeting.downloadAudio}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={transcript.entries.length === 0}
            onClick={() => exportToXLSX(transcript.entries, meetingTitle)}
            className="gap-1.5 text-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {t.meeting.exportXLSX}
          </Button>
        </div>
      )}

      {isEnded && mode === 'standard' && (
        <AudioPlayer
          meetingId={meetingId}
          meetingTitle={meetingTitle}
          onTimeUpdate={setCurrentMs}
          seekRef={seekToRef}
        />
      )}

      <div className="flex-1 overflow-hidden">
        <TranscriptPanel
          entries={transcript.entries}
          currentText={transcript.currentText}
          currentSpeaker={transcript.currentSpeaker}
          currentMs={isEnded ? currentMs : 0}
          onSeek={isEnded && seekToRef.current ? (ms) => seekToRef.current!(ms) : undefined}
        />
      </div>

      {isEnded && mode === 'standard' && transcript.entries.length > 0 && (
        <MeetingSummary
          meetingId={meetingId}
          entries={transcript.entries}
        />
      )}

      <div className="flex items-center justify-between rounded-xl border border-border/30 bg-card/40 px-4 py-2 text-xs text-muted-foreground">
        <span>{transcript.entries.length} entries</span>
        <span>
          🇯🇵 {transcript.entries.filter((e) => e.language === 'ja').length} •{' '}
          🇻🇳 {transcript.entries.filter((e) => e.language === 'vi').length}
        </span>
      </div>
    </div>
  );
}

export default MeetingRoom;
