"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

  /** Process a recorded audio blob through STT. */
  const processAudio = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) return;

    setIsTranscribing(true);
    try {
      const text = await getStt().transcribe(audioBlob);
      setTranscript(text);
    } catch (error) {
      console.error("STT transcription error:", error);
    } finally {
      setIsTranscribing(false);
    }
  }, [getStt]);

  /** Start recording from the microphone. */
  const startRecording = useCallback(async () => {
    const recorder = getRecorder();

    setTranscript(null);
    setIsRecording(true);

    try {
      // Mic permission is requested inside startRecording
      await recorder.startRecording(async () => {
        setIsRecording(false);
        const blob = await recorder.stopRecording();
        processAudio(blob);
      });
    } catch {
      console.error("Microphone permission denied");
      setIsRecording(false);
    }
  }, [getRecorder, processAudio]);

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
