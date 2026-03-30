"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { TextToSpeechService } from "./ttsService";

interface UseSpeakerReturn {
  // TTS state
  isSpeaking: boolean;

  // TTS actions
  preloadQuestion: (text: string) => void;
  speakQuestion: (text: string) => Promise<void>;
  stopSpeaking: () => void;

  // Audio ref for the hidden <audio> element
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useSpeaker(): UseSpeakerReturn {
  // STATE
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Refs
  const ttsServiceRef = useRef<TextToSpeechService | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get or create TTS service instance
  const getTtsService = useCallback(() => {
    if (!ttsServiceRef.current) {
      ttsServiceRef.current = new TextToSpeechService();
    }
    return ttsServiceRef.current;
  }, []);

  /** Preload audio for a question in the background. */
  const preloadQuestion = useCallback((text: string) => {
    getTtsService().preload(text).catch(() => { }); // Silent fail — speak will fetch if preload missed
  }, [getTtsService]);

  /** Speak the given text through the audio element. */
  const speakQuestion = useCallback(async (text: string) => {
    if (!audioRef.current) return;

    setIsSpeaking(true);
    try {
      await getTtsService().speak(text, audioRef.current);
    } catch (error) {
      console.error("TTS playback error:", error);
      toast.error("Text-to-speech generation failed");
    } finally {
      setIsSpeaking(false);
    }
  }, [getTtsService]);

  /** Stop current TTS playback. */
  const stopSpeaking = useCallback(() => {
    const service = ttsServiceRef.current;
    if (service && audioRef.current) {
      service.stop(audioRef.current);
      setIsSpeaking(false);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      ttsServiceRef.current?.dispose();
    };
  }, []);

  return {
    isSpeaking,
    preloadQuestion,
    speakQuestion,
    stopSpeaking,
    audioRef,
  };
}
