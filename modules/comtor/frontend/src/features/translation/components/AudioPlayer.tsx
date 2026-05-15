
import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { tauri } from '@cmt/lib/tauri';

interface AudioPlayerProps {
  meetingId: string;
  meetingTitle: string;
  onTimeUpdate?: (currentMs: number) => void;
  seekRef?: React.MutableRefObject<((ms: number) => void) | null>;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', ''];

export function AudioPlayer({ meetingId, onTimeUpdate, seekRef }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekBarRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'ready' | 'no-audio' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Fetch, decrypt, and load audio
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const exists = await tauri.audio.exists(meetingId);
        if (!exists) { if (!cancelled) setStatus('no-audio'); return; }

        const rawBytes = await tauri.audio.get(meetingId);
        if (rawBytes.length === 0) { if (!cancelled) setStatus('no-audio'); return; }

        if (cancelled) return;

        const audio = audioRef.current;
        if (!audio) throw new Error('Audio element not mounted');

        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

        // Pick best supported MIME type
        let mime = 'audio/webm';
        for (const m of AUDIO_MIME_TYPES) {
          if (!m || audio.canPlayType(m) !== '') { mime = m || 'audio/webm'; break; }
        }

        const url = URL.createObjectURL(new Blob([rawBytes], { type: mime }));
        blobUrlRef.current = url;
        audio.src = url;
        audio.load();

        // webm from MediaRecorder often has no duration header — force browser to scan
        audio.addEventListener('loadedmetadata', () => {
          if (!isFinite(audio.duration) || audio.duration === Infinity) {
            audio.currentTime = 1e101;
            const onSeeked = () => {
              audio.currentTime = 0;
              audio.removeEventListener('seeked', onSeeked);
            };
            audio.addEventListener('seeked', onSeeked);
          }
        }, { once: true });

        if (!cancelled) setStatus('ready');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[AudioPlayer] error:', msg);
        if (!cancelled) { setErrorMsg(msg); setStatus('error'); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [meetingId]);

  // Sync seek bar max attribute when duration becomes known
  useEffect(() => {
    if (seekBarRef.current && durationMs > 0) {
      seekBarRef.current.max = String(durationMs);
    }
  }, [durationMs]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, []);

  // Expose seekTo for parent (transcript sync)
  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (ms: number) => {
      const audio = audioRef.current;
      if (!audio || status !== 'ready') return;
      audio.currentTime = ms / 1000;
      audio.play().catch(console.error);
      setPlaying(true);
    };
  }, [seekRef, status]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || status !== 'ready') return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch((e) => { console.error('[AudioPlayer] play error:', e); setErrorMsg(e.message); });
      setPlaying(true);
    }
  }, [playing, status]);

  if (status === 'no-audio') return null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/80 px-4 py-3">
      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{errorMsg || 'Audio unavailable'}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Always-mounted audio — src set imperatively after decrypt */}
        <audio
          ref={audioRef}
          preload="auto"
          onTimeUpdate={(e) => {
            if (isDraggingRef.current) return;
            const ms = (e.currentTarget.currentTime * 1000) | 0;
            setCurrentMs(ms);
            if (seekBarRef.current) seekBarRef.current.value = String(ms);
            onTimeUpdate?.(ms);
          }}
          onDurationChange={(e) => {
            const dur = e.currentTarget.duration;
            if (isFinite(dur) && dur > 0) setDurationMs((dur * 1000) | 0);
          }}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (isFinite(dur) && dur > 0) setDurationMs((dur * 1000) | 0);
          }}
          onError={(e) => {
            const err = e.currentTarget.error;
            const msg = err ? `MediaError ${err.code}: ${err.message}` : 'Unknown media error';
            console.error('[AudioPlayer]', msg);
            setErrorMsg(msg);
            setStatus('error');
          }}
          onEnded={() => setPlaying(false)}
        />

        {/* Play / Pause */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={status === 'loading' || status === 'error'}
          onClick={handlePlayPause}
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Seek bar — uncontrolled, updated via DOM ref for perf */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatTime(currentMs)}
          </span>
          <input
            ref={seekBarRef}
            type="range"
            min={0}
            max={durationMs || 1}
            defaultValue={0}
            onMouseDown={() => { isDraggingRef.current = true; }}
            onTouchStart={() => { isDraggingRef.current = true; }}
            onChange={(e) => {
              // Update time display while dragging
              setCurrentMs(Number(e.target.value));
            }}
            onMouseUp={(e) => {
              isDraggingRef.current = false;
              const ms = Number((e.target as HTMLInputElement).value);
              const audio = audioRef.current;
              if (audio) audio.currentTime = ms / 1000;
              setCurrentMs(ms);
            }}
            onTouchEnd={(e) => {
              isDraggingRef.current = false;
              const ms = Number((e.currentTarget as HTMLInputElement).value);
              const audio = audioRef.current;
              if (audio) audio.currentTime = ms / 1000;
              setCurrentMs(ms);
            }}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {durationMs > 0 ? formatTime(durationMs) : '--:--'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AudioPlayer;
