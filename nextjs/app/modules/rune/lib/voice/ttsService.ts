/**
 * Split off the first sentence so playback can start before the rest is synthesized.
 * Returns `[firstSentence, remainder]`; remainder is "" when there is nothing to gain
 * from splitting (single sentence, or a very short lead-in that would just add a seam).
 */
function splitFirstSentence(text: string): [string, string] {
  const trimmed = text.trim();
  // End of the first sentence: ., ! or ? followed by whitespace. Avoids splitting on
  // decimals and most abbreviations, which would produce an audible seam mid-phrase.
  const match = /[.!?](\s)/.exec(trimmed);
  if (!match) return [trimmed, ""];

  const head = trimmed.slice(0, match.index + 1);
  const rest = trimmed.slice(match.index + match[0].length).trim();
  // Splitting only pays off when the head is long enough to cover the remainder's
  // synthesis. A 5-character head ("Yes.") buys nothing and costs a seam.
  if (!rest || head.length < 12) return [trimmed, ""];
  return [head, rest];
}

export class TextToSpeechService {
  private speaking = false;
  private audioCache = new Map<string, string>(); // text → base64 WAV data URL
  // Bumped on every stop()/new speak() so an in-flight chunk sequence from a
  // superseded utterance abandons instead of talking over the new one.
  private generation = 0;

  /** Fetch and cache audio for a given text without playing it. */
  async preload(text: string): Promise<void> {
    if (!text || !text.trim()) return; // Nothing to synthesize (e.g. blank Easy explanation)
    if (this.audioCache.has(text)) return;

    const audioData = await this.fetchAudio(text);
    this.audioCache.set(text, audioData);
  }

  /**
   * Synthesize text via the server-side Piper TTS API and play it through the
   * provided audio element. Resolves once the whole utterance has finished playing.
   *
   * Anything already preloaded (questions) plays straight from cache. Anything not
   * preloaded — evaluation explanations, which only exist once grading returns and
   * so sit directly on the answer→speech critical path — is split at the first
   * sentence: the opening sentence is fetched and played while the remainder is
   * still being synthesized in parallel. Time-to-first-audio becomes the cost of
   * one sentence (~0.1s) rather than the whole explanation (~0.6s).
   *
   * Safe against underrun because Piper's medium voice synthesizes at a real-time
   * factor of ~0.06 — the remainder is ready long before the first sentence has
   * finished playing.
   */
  async speak(
    text: string,
    audioElement: HTMLAudioElement
  ): Promise<void> {
    // No-op on blank text (e.g. Easy answers get an empty explanation — the chime is the feedback)
    if (!text || !text.trim()) return;

    // Stop any current playback
    this.stop(audioElement);

    const generation = ++this.generation;
    this.speaking = true;

    try {
      const cached = this.audioCache.get(text);
      const chunks = cached ? [text] : this.planChunks(text);

      // Kick every chunk's synthesis off immediately; they resolve in parallel while
      // the first one plays. Mark later chunks' rejections handled up front — they
      // are not awaited until earlier chunks finish playing, and a chunk that fails
      // (or is abandoned by stop()) in the meantime would otherwise surface as an
      // unhandled rejection.
      const pending = chunks.map((chunk) => this.getAudio(chunk));
      for (const p of pending) p.catch(() => { /* surfaced where it is awaited */ });

      for (const chunkAudio of pending) {
        const url = await chunkAudio;
        if (generation !== this.generation) return; // superseded by stop() or a newer speak()
        await this.playOne(url, audioElement);
        if (generation !== this.generation) return; // stopped mid-sequence
      }
    } finally {
      if (generation === this.generation) this.speaking = false;
    }
  }

  /** Chunk plan for an utterance: first sentence, then the remainder. */
  private planChunks(text: string): string[] {
    const [head, rest] = splitFirstSentence(text);
    return rest ? [head, rest] : [head];
  }

  /** Cache-aware fetch for a single chunk. */
  private async getAudio(text: string): Promise<string> {
    const cached = this.audioCache.get(text);
    if (cached) return cached;
    const url = await this.fetchAudio(text);
    this.audioCache.set(text, url);
    return url;
  }

  /** Play one audio URL to completion (resolves on end, pause/stop, or error). */
  private playOne(url: string, audioElement: HTMLAudioElement): Promise<void> {
    audioElement.src = url;

    return new Promise<void>((resolve, reject) => {
      const onEnded = () => { cleanup(); resolve(); };
      const onPause = () => { cleanup(); resolve(); }; // Intentional stop — resolve cleanly
      const onError = () => { cleanup(); reject(new Error("Audio playback failed")); };
      const cleanup = () => {
        audioElement.removeEventListener("ended", onEnded);
        audioElement.removeEventListener("pause", onPause);
        audioElement.removeEventListener("error", onError);
      };

      audioElement.addEventListener("ended", onEnded);
      audioElement.addEventListener("pause", onPause);
      audioElement.addEventListener("error", onError);

      audioElement.play().catch((error) => { cleanup(); reject(error); });
    });
  }

  /** Fetch audio from the TTS API as a playable data URL. */
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
    // Abandon any queued chunks before pausing, so the pause handler doesn't let
    // the sequence advance to the next chunk.
    this.generation++;
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
    this.generation++;
    this.audioCache.clear();
    this.speaking = false;
  }
}
