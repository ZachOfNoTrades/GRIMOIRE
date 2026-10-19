import type { MicVAD } from "@ricky0123/vad-web";

// Spoken-answer capture. The audio is RECORDED with MediaRecorder straight off the
// microphone track and decoded to 16 kHz PCM in the browser; the Web Audio graph only
// feeds the Silero voice activity model that detects when the speaker stops. Capturing PCM through the graph
// (ScriptProcessorNode on an AudioContext) broke on Firefox for Android the moment
// Android moved the mic to a Bluetooth headset: the headset stream runs at a lower
// rate and Firefox fed its samples into the graph unresampled — a 16 kHz context got
// pure zeros, a 48 kHz context got speech playing 2× fast ("*mumbling*" to Whisper).
// MediaRecorder encodes the track at its own rate, and decodeAudioData resamples the
// result to the rate the WAV declares, so what reaches Whisper is always right.
const WAV_RATE = 16000; // Whisper's native rate
// A hands-free answer that never goes quiet (speech the model never sees end) is cut
// here rather than growing until transcription times out.
const MAX_RECORD_MS = 60_000;
// The model must report quiet this long before the speaker counts as done, to avoid
// every pause between words firing a "speech ended" snapshot and its transcription.
const SILENCE_CONFIRM_MS = 400;
// Silero speech probability per 96 ms frame. Speech is one frame at or above
// SPEECH_PROBABILITY or the last SPEECH_WINDOW_FRAMES summing to SPEECH_WINDOW_SUM;
// quiet is a frame below QUIET_PROBABILITY. A voice model instead of a level
// threshold avoids missing speech that is barely louder than road noise on a car
// hands-free mic, and the window sum avoids missing speech the model scores low
// for a second (0.15-0.2 a frame) while road noise only blips. The legacy (v4)
// model scores narrowband hands-free speech higher than v5 and v6.
const SPEECH_PROBABILITY = 0.3;
const SPEECH_WINDOW_FRAMES = 8;
const SPEECH_WINDOW_SUM = 0.8;
const QUIET_PROBABILITY = 0.1;
const VAD_ASSET_PATH = "/vad/"; // Model, worklet and ONNX runtime files copied by scripts/copy-vad-assets.mjs
const TIMESLICE_MS = 250;
const MIME_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];

// What the device actually delivered, sent with each transcription so a recording
// that misbehaves (Bluetooth headsets) can be diagnosed from the server log.
export interface RecorderDiagnostics {
  track: { label: string; settings: MediaTrackSettings } | null;
  contextRate: number | null;
  mimeType: string | null;
  decodedRate: number | null;   // rate decodeAudioData saw in the encoded audio
  encodedBytes: number;
  chunks: number;
  seconds: number;
  vadFrames: number;          // frames the voice activity model scored
  speechProbabilityMax: number | null;
  vadError: string | null;    // why the voice activity model failed to start
  vadStartMs: number | null;  // recording start to the model's first scored frame
  speechDetected: boolean;
  speechEnds: number;    // confirmed speech-end snapshots this recording
  // Track mute/unmute while recording: an OS switching a Bluetooth headset between
  // its music and call profiles shows up here as a muted stretch.
  mutedAtStart: boolean | null;
  muteEvents: number;
  unmuteEvents: number;
}

type Diag = Omit<RecorderDiagnostics, "chunks" | "seconds" | "encodedBytes">;

function emptyDiag(): Diag {
  return { track: null, contextRate: null, mimeType: null, decodedRate: null, vadFrames: 0, speechProbabilityMax: null, vadError: null, vadStartMs: null, speechDetected: false, speechEnds: 0, mutedAtStart: null, muteEvents: 0, unmuteEvents: 0 };
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  // Voice activity model, loaded once by prepare() and reused for every recording, to
  // avoid its ~2 s start-up missing the first words of an answer.
  private vadContext: AudioContext | null = null;
  private vadReady: Promise<MicVAD | null> | null = null;
  private vadError: string | null = null;
  private vadIdle: Promise<void> = Promise.resolve(); // Settles once the previous recording's pause finishes
  private onVadFrame: ((probability: number) => void) | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private recording = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceStop: (() => void) | null = null;
  private onSpeechEnd: ((audio: Blob) => void) | null = null;
  private onSpeechResume: (() => void) | null = null;
  private diag: Diag = emptyDiag();

  /**
   * Start recording audio from the microphone.
   * Auto-stops after `silenceMs` of post-speech silence if `onStop` is provided.
   *
   * `hooks.onSpeechEnd` fires once the speaker has been quiet for SILENCE_CONFIRM_MS —
   * when the silence countdown *starts*, not when it expires — and hands over a WAV of
   * everything captured so far. Because the countdown only runs to completion if no
   * further speech arrives, that snapshot is the complete answer: everything recorded
   * after it is silence. Transcribing it during the countdown therefore takes STT off
   * the critical path entirely. `hooks.onSpeechResume` fires if the speaker starts
   * again before the countdown expires, which makes that snapshot stale.
   */
  async startRecording(
    onStop: (() => void) | undefined,
    silenceMs: number,
    hooks?: { onSpeechEnd?: (audio: Blob) => void; onSpeechResume?: () => void },
  ): Promise<void> {
    if (this.recording) return;

    // Request mic each time so the browser indicator tracks recording accurately.
    // No voice processing on purpose: with echo cancellation / noise suppression on,
    // Firefox for Android opens the capture as a "voice" stream and Android then
    // routes it to a connected Bluetooth headset's hands-free mic — the 8 kHz stream
    // Firefox mislabels (see the header comment). A plain capture stays on the phone
    // mic. Echo is not a concern: the question has finished playing before this runs.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    this.chunks = [];
    this.recording = true;
    this.startedAt = Date.now();
    this.onSilenceStop = onStop ?? null;
    this.onSpeechEnd = hooks?.onSpeechEnd ?? null;
    this.onSpeechResume = hooks?.onSpeechResume ?? null;

    const track = this.stream.getAudioTracks()[0];
    const mimeType = MIME_TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
    this.diag = {
      ...emptyDiag(),
      track: track ? { label: track.label, settings: track.getSettings() } : null,
      mimeType: mimeType ?? null,
      mutedAtStart: track ? track.muted : null,
    };
    if (track) {
      track.onmute = () => { this.diag.muteEvents += 1; };
      track.onunmute = () => { this.diag.unmuteEvents += 1; };
    }

    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.mediaRecorder.start(TIMESLICE_MS);

    if (onStop) {
      this.maxTimer = setTimeout(() => {
        if (this.recording && this.onSilenceStop) this.onSilenceStop();
      }, MAX_RECORD_MS);
      await this.startSilenceDetection(silenceMs);
    }
  }

  /** Stop recording and return the audio as a 16 kHz WAV Blob. */
  async stopRecording(): Promise<Blob> {
    if (!this.recording) return new Blob([]);

    this.stopSilenceDetection();
    this.recording = false;

    // Flush the encoder; its last chunk arrives before `stop` fires.
    const recorder = this.mediaRecorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    this.mediaRecorder = null;

    this.releaseStream();

    const wav = await this.snapshotWav();
    this.chunks = [];
    return wav;
  }

  /**
   * Decode everything captured so far to a 16 kHz WAV, without disturbing the
   * recording. Used both for the final blob and for the mid-recording speech-end
   * snapshot. The chunks concatenate into one valid file: the first carries the
   * container header, the rest are continuation pages.
   */
  private async snapshotWav(): Promise<Blob> {
    if (this.chunks.length === 0) return new Blob([]);
    const encoded = new Blob(this.chunks, { type: this.chunks[0].type });
    const bytes = await encoded.arrayBuffer();
    // decodeAudioData resamples to the context's rate, so the PCM comes out at WAV_RATE
    // whatever rate the microphone (phone or headset) actually ran at.
    const context = new OfflineAudioContext(1, 1, WAV_RATE);
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(bytes);
    } catch (error) {
      console.warn("Recorded audio could not be decoded:", error);
      return new Blob([]);
    }
    this.diag.decodedRate = decoded.sampleRate;
    return this.encodeWav(decoded.getChannelData(0), decoded.sampleRate);
  }

  getDiagnostics(): RecorderDiagnostics {
    const encodedBytes = this.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    return {
      ...this.diag,
      chunks: this.chunks.length,
      encodedBytes,
      seconds: this.recording || this.startedAt ? Math.round((Date.now() - this.startedAt) / 100) / 10 : 0,
    };
  }

  isRecording(): boolean {
    return this.recording;
  }

  /** Release all resources. */
  dispose(): void {
    this.stopSilenceDetection();
    this.vadReady?.then((vad) => vad?.destroy()).catch(() => {});
    this.vadReady = null;
    this.vadContext?.close().catch(() => {});
    this.vadContext = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.releaseStream();
    this.recording = false;
  }

  /** Load the voice activity model ahead of the first recording. */
  prepare(): Promise<MicVAD | null> {
    this.vadReady ??= this.loadVad();
    return this.vadReady;
  }

  private async loadVad(): Promise<MicVAD | null> {
    try {
      const { MicVAD } = await import("@ricky0123/vad-web"); // Load on demand to avoid shipping the model runtime with every page
      this.vadContext = new AudioContext();
      return await MicVAD.new({
        model: "legacy",
        baseAssetPath: VAD_ASSET_PATH,
        onnxWASMBasePath: VAD_ASSET_PATH,
        audioContext: this.vadContext,
        startOnLoad: false,
        getStream: async () => this.requireStream(),
        resumeStream: async () => this.requireStream(),
        pauseStream: async () => {}, // Leave the stream to releaseStream
        onFrameProcessed: (probabilities) => this.onVadFrame?.(probabilities.isSpeech),
      });
    } catch (error) {
      this.vadError = error instanceof Error ? error.message : String(error);
      console.warn("Voice activity model failed to load:", error);
      return null;
    }
  }

  private requireStream(): MediaStream {
    if (!this.stream) throw new Error("No microphone stream to analyze");
    return this.stream;
  }

  /** Stop mic stream tracks so the browser indicator disappears. */
  private releaseStream(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /** Encode Float32 PCM as a 16-bit WAV file Blob. */
  private encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const headerSize = 44;

    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Convert Float32 [-1,1] to Int16
    let writeOffset = headerSize;
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(writeOffset, clamped * 0x7FFF, true);
      writeOffset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  private writeString(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  /**
   * Run the Silero voice activity model on the mic and auto-stop after sustained
   * silence, but only once speech has been detected first.
   */
  private async startSilenceDetection(silenceMs: number): Promise<void> {
    let speechDetected = false;
    let quietSince: number | null = null;
    const recent: number[] = [];

    this.onVadFrame = (probability: number) => {
      if (!this.recording) return;
      this.diag.vadFrames += 1;
      this.diag.vadStartMs ??= Date.now() - this.startedAt;
      this.diag.speechProbabilityMax = Math.max(this.diag.speechProbabilityMax ?? 0, probability);

      recent.push(probability);
      if (recent.length > SPEECH_WINDOW_FRAMES) recent.shift();
      const windowSum = recent.reduce((sum, p) => sum + p, 0);

      if (probability >= SPEECH_PROBABILITY || windowSum >= SPEECH_WINDOW_SUM) {
        speechDetected = true;
        this.diag.speechDetected = true;
        quietSince = null;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
          // Speaking again mid-countdown: the snapshot handed to onSpeechEnd is
          // now an incomplete answer, so whoever is transcribing it must drop it.
          this.onSpeechResume?.();
        }
      } else if (probability < QUIET_PROBABILITY && speechDetected && !this.silenceTimer) {
        // Quiet after speech: only a sustained quiet counts as the end of the answer.
        quietSince ??= Date.now();
        if (Date.now() - quietSince >= SILENCE_CONFIRM_MS) {
          this.silenceTimer = setTimeout(() => {
            if (this.recording && this.onSilenceStop) {
              this.onSilenceStop();
            }
          }, silenceMs - SILENCE_CONFIRM_MS);
          // Hand off the answer-so-far so transcription can run during the
          // countdown instead of after it. The encoder is flushed first so the
          // snapshot holds everything spoken.
          this.diag.speechEnds += 1;
          this.flushAndSnapshot().then((wav) => {
            if (this.recording && this.silenceTimer) this.onSpeechEnd?.(wav);
          });
        }
      }
    };

    const vad = await this.prepare();
    if (!vad || !this.vadContext) {
      this.diag.vadError = this.vadError;
      return;
    }
    if (!this.recording) return; // Stopped while the model loaded
    this.diag.contextRate = this.vadContext.sampleRate;
    try {
      await this.vadIdle; // Wait for the last pause to avoid it landing after this start
      await this.vadContext.resume();
      await vad.start();
    } catch (error) {
      this.diag.vadError = error instanceof Error ? error.message : String(error);
      console.warn("Voice activity model failed to start:", error);
    }
  }

  // Ask the encoder for its buffered data, then decode everything so far.
  private async flushAndSnapshot(): Promise<Blob> {
    const recorder = this.mediaRecorder;
    if (recorder && recorder.state === "recording") {
      await new Promise<void>((resolve) => {
        const previous = recorder.ondataavailable;
        recorder.ondataavailable = (event) => {
          previous?.call(recorder, event);
          recorder.ondataavailable = previous;
          resolve();
        };
        recorder.requestData();
      });
    }
    return this.snapshotWav();
  }

  private stopSilenceDetection(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.onVadFrame = null;
    const vadReady = this.vadReady;
    if (vadReady) {
      this.vadIdle = vadReady
        .then((vad) => vad?.pause())
        .then(() => this.vadContext?.suspend()) // Suspend between recordings to avoid holding the audio hardware
        .catch(() => {});
    }
    this.onSpeechEnd = null;
    this.onSpeechResume = null;
  }
}
