export class TextToSpeechService {
  private speaking = false;
  private audioCache = new Map<string, string>(); // text → base64 data URL

  /** Fetch and cache audio for a given text without playing it. */
  async preload(text: string): Promise<void> {
    if (this.audioCache.has(text)) return;

    const audioData = await this.fetchAudio(text);
    this.audioCache.set(text, audioData);
  }

  /**
   * Synthesize text via the server-side Piper TTS API and play through the provided audio element.
   * Uses cached audio if available.
   */
  async speak(
    text: string,
    audioElement: HTMLAudioElement
  ): Promise<void> {
    // Stop any current playback
    this.stop(audioElement);

    this.speaking = true;

    try {
      // Use cache or fetch
      let audioData = this.audioCache.get(text);
      if (!audioData) {
        audioData = await this.fetchAudio(text);
        this.audioCache.set(text, audioData);
      }

      audioElement.src = audioData;

      // Wait for playback to complete (resolves on end, pause/stop, or error)
      await new Promise<void>((resolve, reject) => {
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onPause = () => {
          cleanup();
          resolve(); // Intentional stop — resolve cleanly
        };
        const onError = () => {
          cleanup();
          reject(new Error("Audio playback failed"));
        };
        const cleanup = () => {
          audioElement.removeEventListener("ended", onEnded);
          audioElement.removeEventListener("pause", onPause);
          audioElement.removeEventListener("error", onError);
        };

        audioElement.addEventListener("ended", onEnded);
        audioElement.addEventListener("pause", onPause);
        audioElement.addEventListener("error", onError);

        audioElement.play().catch((error) => {
          cleanup();
          reject(error);
        });
      });
    } finally {
      this.speaking = false;
    }
  }

  /** Fetch audio from the TTS API. */
  private async fetchAudio(text: string): Promise<string> {
    const response = await fetch("/modules/rune/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      let message = "TTS generation failed";
      try {
        const error = await response.json();
        message = error.error || message;
      } catch { /* response may not be JSON */ }
      throw new Error(message);
    }

    const data = await response.json();
    return data.audioData;
  }

  /** Stop current playback. */
  stop(audioElement: HTMLAudioElement): void {
    if (!audioElement.paused) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** Clean up resources. */
  dispose(): void {
    this.audioCache.clear();
    this.speaking = false;
  }
}
