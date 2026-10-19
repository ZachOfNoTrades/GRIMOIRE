"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { AudioRecorder, type RecorderDiagnostics } from "./audioRecorder";
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

export function useListener(silenceMs: number): UseListenerReturn {
  // STATE
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  // Refs
  const recorderRef = useRef<AudioRecorder | null>(null);
  const sttRef = useRef<SpeechToTextService | null>(null);
  const recordingStartRef = useRef<number>(0);
  const recordingIdRef = useRef(0); // Latest recording, to avoid a canceled recording's transcript landing later
  // Transcription started the moment the speaker went quiet, running in parallel
  // with the silence countdown. Nulled if they resume speaking, which makes the
  // snapshot it was given an incomplete answer.
  const headStartRef = useRef<Promise<string> | null>(null);
  // Cancels the in-flight head start; only one transcription runs per recording.
  const headStartAbortRef = useRef<AbortController | null>(null);

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
   * invalidated the snapshot). Expects isTranscribing already set by the caller.
   */
  const processAudio = useCallback(async (audioBlob: Blob, diagnostics?: RecorderDiagnostics) => {
    const recordingId = recordingIdRef.current;
    const recordingDuration = Date.now() - recordingStartRef.current;
    const headStart = headStartRef.current;
    headStartRef.current = null;
    if (!headStart && (audioBlob.size === 0 || recordingDuration < 1000)) {
      setIsTranscribing(false);
      return;
    }

    try {
      const text = await (headStart ?? getStt().transcribe(audioBlob, diagnostics));
      if (recordingIdRef.current === recordingId) setTranscript(text); // Skip a transcript for a canceled recording
    } catch (error) {
      if (recordingIdRef.current !== recordingId) return;
      console.error("STT transcription error:", error);
      toast.error("Speech-to-text generation failed");
    } finally {
      if (recordingIdRef.current === recordingId) setIsTranscribing(false);
    }
  }, [getStt]);

  /** Stop the recorder and transcribe what it captured. */
  const finishRecording = useCallback(async (recorder: AudioRecorder) => {
    setIsRecording(false);
    setIsTranscribing(true); // Set with isRecording to avoid the button showing Record while the audio decodes
    const diagnostics = recorder.getDiagnostics();
    const blob = await recorder.stopRecording();
    processAudio(blob, diagnostics);
  }, [processAudio]);

  /** Start recording from the microphone. */
  const startRecording = useCallback(async () => {
    const recorder = getRecorder();

    recordingIdRef.current += 1;
    setTranscript(null);
    setIsRecording(true);
    recordingStartRef.current = Date.now();
    headStartRef.current = null;

    try {
      // Mic permission is requested inside startRecording
      await recorder.startRecording(
        () => finishRecording(recorder),
        silenceMs,
        {
          // Speaker went quiet: transcribe the answer-so-far while the silence
          // countdown runs, so the result is waiting when the countdown expires.
          onSpeechEnd: (audio: Blob) => {
            if (audio.size === 0) return;
            // A newer snapshot supersedes the one still in flight.
            headStartAbortRef.current?.abort();
            const controller = new AbortController();
            headStartAbortRef.current = controller;
            const pending = getStt().transcribe(audio, recorder.getDiagnostics(), controller.signal);
            // Mark the rejection handled on a derived promise so a failure that is
            // never awaited (speaker resumed, recording cancelled) can't surface as
            // an unhandled rejection. `pending` itself still rejects for processAudio.
            pending.catch(() => { /* surfaced where it is awaited */ });
            headStartRef.current = pending;
          },
          // Speaking resumed: that snapshot was mid-answer, so discard it and let
          // the next speech-end (or the final blob) drive transcription.
          onSpeechResume: () => {
            headStartRef.current = null;
            headStartAbortRef.current?.abort();
            headStartAbortRef.current = null;
          },
        },
      );
    } catch {
      toast.error("Microphone permission denied");
      setIsRecording(false);
    }
  }, [getRecorder, getStt, finishRecording, silenceMs]);

  /** Stop recording and transcribe. */
  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;

    await finishRecording(recorder);
  }, [finishRecording]);

  /** Stop recording and discard its audio and any transcription still running. */
  const cancelRecording = useCallback(() => {
    recordingIdRef.current += 1; // Drop the result of a transcription still in flight
    setIsTranscribing(false);
    headStartRef.current = null;
    headStartAbortRef.current?.abort();
    headStartAbortRef.current = null;

    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;
    setIsRecording(false);
    recorder.stopRecording(); // Discard the blob
  }, []);

  /** Clear the current transcript. */
  const clearTranscript = useCallback(() => {
    setTranscript(null);
  }, []);

  // Load the voice activity model on mount, and release everything on unmount
  useEffect(() => {
    getRecorder().prepare();
    return () => {
      recorderRef.current?.dispose();
    };
  }, [getRecorder]);

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
