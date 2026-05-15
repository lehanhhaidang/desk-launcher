
import { useState } from 'react';
import { Mic, Square, Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { useI18n } from '@cmt/lib/i18n';

interface MeetingControlsProps {
  isActive: boolean;
  isPaused: boolean;
  isEnded: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * MeetingControls — Start / Pause / Resume / End buttons for a meeting.
 * Start and End buttons show confirmation dialogs.
 * Once ended, no controls are shown.
 */
export function MeetingControls({
  isActive,
  isPaused,
  isEnded,
  connectionState,
  onStart,
  onPause,
  onResume,
  onStop,
}: MeetingControlsProps) {
  const { t } = useI18n();
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const isConnecting = connectionState === 'connecting';

  // No controls after meeting ended
  if (isEnded) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Recording indicator */}
      {isActive && !isPaused && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
          REC
        </span>
      )}
      {isActive && isPaused && (
        <span className="flex items-center gap-1 text-xs text-yellow-500">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          {t.meeting.paused ?? 'Paused'}
        </span>
      )}

      {!isActive ? (
        /* Start button */
        <Button
          onClick={() => setShowStartConfirm(true)}
          disabled={isConnecting}
          className="gap-2 rounded-xl bg-vietnamese hover:bg-vietnamese/90"
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {t.meeting.startMeeting}
        </Button>
      ) : (
        <>
          {/* Pause / Resume */}
          <Button
            onClick={isPaused ? onResume : onPause}
            variant="outline"
            className="gap-2 rounded-xl"
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4" />
                {t.meeting.resume ?? 'Resume'}
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                {t.meeting.pause ?? 'Pause'}
              </>
            )}
          </Button>

          {/* End button */}
          <Button
            onClick={() => setShowEndConfirm(true)}
            variant="destructive"
            className="gap-2 rounded-xl"
          >
            <Square className="h-4 w-4" />
            {t.meeting.endMeeting}
          </Button>
        </>
      )}

      {/* Start confirmation popup */}
      {showStartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">
              {t.meeting.confirmStartTitle ?? 'Start meeting?'}
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {t.meeting.confirmStartMessage ??
                'Microphone and transcription will begin.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowStartConfirm(false)}
                className="rounded-xl"
              >
                {t.common.cancel}
              </Button>
              <Button
                onClick={() => {
                  setShowStartConfirm(false);
                  onStart();
                }}
                className="gap-2 rounded-xl bg-vietnamese hover:bg-vietnamese/90"
              >
                <Mic className="h-4 w-4" />
                {t.meeting.startMeeting}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* End confirmation popup */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">
              {t.meeting.confirmEndTitle ?? 'End meeting?'}
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {t.meeting.confirmEndMessage ??
                'Transcript and audio will be saved. This cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowEndConfirm(false)}
                className="rounded-xl"
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowEndConfirm(false);
                  onStop();
                }}
                className="rounded-xl"
              >
                {t.meeting.endMeeting}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingControls;
