
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

/** Return type for useAudioRecorder hook */
interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number;
  hasRecording: boolean;
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => void;
  downloadRecording: (filename: string) => void;
  /** Get the raw recorded blob (for upload) */
  getBlob: () => Blob | null;
  /** Returns a Promise that resolves with the blob exactly when MediaRecorder.onstop fires */
  waitForBlob: () => Promise<Blob | null>;
}

/**
 * Determine the best supported audio MIME type for MediaRecorder.
 */
function getSupportedMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/webm';
}

/**
 * useAudioRecorder — browser-side audio recording using MediaRecorder API.
 * Reuses the mic stream from useSonioxRealtime (no duplicate mic access).
 *
 * State machine: idle → recording → stopped
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Promise that resolves when MediaRecorder.onstop fires
  const blobResolverRef = useRef<((b: Blob | null) => void) | null>(null);
  const blobPromiseRef = useRef<Promise<Blob | null>>(Promise.resolve(null));

  /**
   * Start recording audio from the provided MediaStream.
   * Uses MediaRecorder with WebM/Opus format.
   */
  const startRecording = useCallback((stream: MediaStream): void => {
    // Reset previous state
    chunksRef.current = [];
    blobRef.current = null;
    setHasRecording(false);
    setDuration(0);

    // Create a new promise that will resolve when onstop fires
    blobPromiseRef.current = new Promise<Blob | null>((resolve) => {
      blobResolverRef.current = resolve;
    });

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      blobRef.current = blob;
      setHasRecording(true);
      setIsRecording(false);

      // Resolve the waiting promise
      blobResolverRef.current?.(blob);
      blobResolverRef.current = null;

      // Clear duration timer
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    recorder.start(1000); // collect data every second
    setIsRecording(true);

    // Track duration
    intervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  /**
   * Stop the current recording. The recording blob becomes available
   * for download via downloadRecording().
   */
  const stopRecording = useCallback((): void => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Download the recorded audio as a WebM file.
   * Creates an object URL, triggers a click on a temporary anchor element, then revokes the URL.
   */
  const downloadRecording = useCallback((filename: string): void => {
    if (!blobRef.current) return;

    // Revoke any previous URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(blobRef.current);
    objectUrlRef.current = url;

    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    objectUrlRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const getBlob = useCallback((): Blob | null => blobRef.current, []);

  const waitForBlob = useCallback((): Promise<Blob | null> => blobPromiseRef.current, []);

  return useMemo(() => ({
    isRecording,
    duration,
    hasRecording,
    startRecording,
    stopRecording,
    downloadRecording,
    getBlob,
    waitForBlob,
  }), [isRecording, duration, hasRecording, startRecording, stopRecording, downloadRecording, getBlob, waitForBlob]);
}
