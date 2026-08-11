"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { AudioRecorder } from "./audioRecorder";
import { SpeechToTextService } from "./sttService";

interface UseListenerReturn {
  // STT state
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string | null;

  // STT actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => void;
  clearTranscript: () => void;
}

export function useListener(): UseListenerReturn {
  // STATE
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  // Refs
  const recorderRef = useRef<AudioRecorder | null>(null);
  const sttRef = useRef<SpeechToTextService | null>(null);
  const recordingStartRef = useRef<number>(0);
  // Transcription started the moment the speaker went quiet, running in parallel
  // with the silence countdown. Nulled if they resume speaking, which makes the
  // snapshot it was given an incomplete answer.
  const headStartRef = useRef<Promise<string> | null>(null);

  // Get or create instances
  const getRecorder = useCallback(() => {
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder();
    }
    return recorderRef.current;
  }, []);

  const getStt = useCallback(() => {
    if (!sttRef.current) {
      sttRef.current = new SpeechToTextService();
    }
    return sttRef.current;
  }, []);

  /**
   * Process a recorded audio blob through STT. Discards if recording was under 1 second.
   *
   * Prefers the head-start transcription kicked off at speech-end, which is normally
   * already resolved by the time the silence countdown expires — so the user waits
   * ~0ms here instead of a full Whisper pass. Falls back to transcribing `audioBlob`
   * when there is no valid head start (a manual stop mid-sentence, or a resume that
   * invalidated the snapshot).
   */
  const processAudio = useCallback(async (audioBlob: Blob) => {
    const recordingDuration = Date.now() - recordingStartRef.current;
    const headStart = headStartRef.current;
    headStartRef.current = null;
    if (!headStart && (audioBlob.size === 0 || recordingDuration < 1000)) return;

    setIsTranscribing(true);
    try {
      const text = await (headStart ?? getStt().transcribe(audioBlob));
      setTranscript(text);
    } catch (error) {
      console.error("STT transcription error:", error);
      toast.error("Speech-to-text generation failed");
    } finally {
      setIsTranscribing(false);
    }
  }, [getStt]);

  /** Start recording from the microphone. */
  const startRecording = useCallback(async () => {
    const recorder = getRecorder();

    setTranscript(null);
    setIsRecording(true);
    recordingStartRef.current = Date.now();
    headStartRef.current = null;

    try {
      // Mic permission is requested inside startRecording
      await recorder.startRecording(
        async () => {
          setIsRecording(false);
          const blob = await recorder.stopRecording();
          processAudio(blob);
        },
        undefined, // keep the configured silence timeout
        {
          // Speaker went quiet: transcribe the answer-so-far while the silence
          // countdown runs, so the result is waiting when the countdown expires.
          onSpeechEnd: (audio: Blob) => {
            if (audio.size === 0) return;
            const pending = getStt().transcribe(audio);
            // Mark the rejection handled on a derived promise so a failure that is
            // never awaited (speaker resumed, recording cancelled) can't surface as
            // an unhandled rejection. `pending` itself still rejects for processAudio.
            pending.catch(() => { /* surfaced where it is awaited */ });
            headStartRef.current = pending;
          },
          // Speaking resumed: that snapshot was mid-answer, so discard it and let
          // the next speech-end (or the final blob) drive transcription.
          onSpeechResume: () => { headStartRef.current = null; },
        },
      );
    } catch {
      toast.error("Microphone permission denied");
      setIsRecording(false);
    }
  }, [getRecorder, getStt, processAudio]);

  /** Stop recording and transcribe. */
  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;

    setIsRecording(false);
    const blob = await recorder.stopRecording();
    processAudio(blob);
  }, [processAudio]);

  /** Stop recording and discard audio without transcribing. */
  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;

    setIsRecording(false);
    headStartRef.current = null; // Drop any in-flight head-start transcription too
    recorder.stopRecording(); // Discard the blob
  }, []);

  /** Clear the current transcript. */
  const clearTranscript = useCallback(() => {
    setTranscript(null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.dispose();
    };
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
  };
}
