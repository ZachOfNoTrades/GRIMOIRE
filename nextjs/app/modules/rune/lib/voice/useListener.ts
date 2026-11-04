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

export function useListener(silenceMs: number, onRecordingStopped?: () => void): UseListenerReturn {
  // STATE
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  // Refs
  const recorderRef = useRef<AudioRecorder | null>(null);
  const sttRef = useRef<SpeechToTextService | null>(null);
  const recordingStartRef = useRef<number>(0);
  const onRecordingStoppedRef = useRef(onRecordingStopped); // Latest callback, to avoid rebuilding the recording callbacks each render
  const recordingIdRef = useRef(0); // Latest recording, to avoid a canceled recording's transcript landing later
  // Transcription started the moment the speaker went quiet, running in parallel
  // with the silence countdown. Nulled if they resume speaking, which makes the
  // snapshot it was given an incomplete answer.
  const headStartRef = useRef<Promise<string> | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null); // Abort for the transcription in flight; only one runs per recording
  const openingRef = useRef<Promise<void> | null>(null); // Latest start, settled once its mic is open or discarded

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
   * Transcribe a finished recording, preferring the transcription started when the speaker went quiet.
   * NOTE: Drops audio under 1 second, and audio from a recording canceled since it stopped
   */
  const processAudio = useCallback(async (recordingId: number, audioBlob: Blob, diagnostics?: RecorderDiagnostics) => {
    if (recordingIdRef.current !== recordingId) return; // Skip a recording canceled while its audio was decoding
    const recordingDuration = Date.now() - recordingStartRef.current;
    const headStart = headStartRef.current;
    headStartRef.current = null;
    if (!headStart && (audioBlob.size === 0 || recordingDuration < 1000)) {
      setIsTranscribing(false);
      return;
    }

    // Without a head start, transcribe the final blob under its own abort controller, to avoid a canceled recording's request running on
    let transcription = headStart;
    if (!transcription) {
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;
      transcription = getStt().transcribe(audioBlob, diagnostics, controller.signal);
    }

    try {
      const text = await transcription;
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
    const recordingId = recordingIdRef.current;
    setIsRecording(false);
    setIsTranscribing(true); // Set with isRecording to avoid the button showing Record while the audio decodes
    const diagnostics = recorder.getDiagnostics();
    const blob = await recorder.stopRecording();
    onRecordingStoppedRef.current?.(); // Run once the mic is released
    processAudio(recordingId, blob, diagnostics);
  }, [processAudio]);

  /** Start recording from the microphone. */
  const startRecording = useCallback(async () => {
    const recorder = getRecorder();

    const recordingId = ++recordingIdRef.current;
    setTranscript(null);
    setIsRecording(true);
    recordingStartRef.current = Date.now();
    headStartRef.current = null;

    await openingRef.current; // Wait for an earlier start to open or discard the mic, to avoid two starts sharing the recorder
    if (recordingIdRef.current !== recordingId) return; // Skip a recording canceled while it waited

    // Open the mic, and discard the recording when it was canceled while the mic was opening
    const opening = (async () => {
      // Mic permission is requested inside startRecording
      await recorder.startRecording(
        () => finishRecording(recorder),
        silenceMs,
        {
          // Transcribe the answer so far while the silence countdown runs, to avoid waiting on it once the countdown expires
          onSpeechEnd: (audio: Blob) => {
            if (audio.size === 0) return;
            transcriptionAbortRef.current?.abort(); // Cancel an earlier snapshot's transcription
            const controller = new AbortController();
            transcriptionAbortRef.current = controller;
            const pending = getStt().transcribe(audio, recorder.getDiagnostics(), controller.signal);
            pending.catch(() => { /* surfaced where it is awaited */ }); // Handle the rejection, to avoid an unhandled rejection when the snapshot is never awaited
            headStartRef.current = pending;
          },
          // Discard the snapshot once speaking resumes, as it holds only part of the answer
          onSpeechResume: () => {
            headStartRef.current = null;
            transcriptionAbortRef.current?.abort();
            transcriptionAbortRef.current = null;
          },
        },
      );

      if (recordingIdRef.current !== recordingId) await recorder.stopRecording();
    })();
    openingRef.current = opening.catch(() => { /* surfaced below */ });

    try {
      await opening;
    } catch {
      toast.error("Microphone permission denied");
      if (recordingIdRef.current === recordingId) setIsRecording(false);
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
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    setIsRecording(false); // Clear while the mic is still opening too

    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;
    recorder.stopRecording(); // Discard the blob
  }, []);

  /** Clear the current transcript. */
  const clearTranscript = useCallback(() => {
    setTranscript(null);
  }, []);

  useEffect(() => {
    onRecordingStoppedRef.current = onRecordingStopped;
  }, [onRecordingStopped]);

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
