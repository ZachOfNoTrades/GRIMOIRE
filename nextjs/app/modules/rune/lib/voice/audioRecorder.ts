// Spoken-answer capture. The audio is RECORDED with MediaRecorder straight off the
// microphone track and decoded to 16 kHz PCM in the browser; the Web Audio graph is
// used only to watch the level for silence detection. Capturing PCM through the graph
// (ScriptProcessorNode on an AudioContext) broke on Firefox for Android the moment
// Android moved the mic to a Bluetooth headset: the headset stream runs at a lower
// rate and Firefox fed its samples into the graph unresampled — a 16 kHz context got
// pure zeros, a 48 kHz context got speech playing 2× fast ("*mumbling*" to Whisper).
// MediaRecorder encodes the track at its own rate, and decodeAudioData resamples the
// result to the rate the WAV declares, so what reaches Whisper is always right.
const WAV_RATE = 16000; // Whisper's native rate
// A hands-free answer that never goes quiet (a noisy mic above the threshold) is cut
// here rather than growing until transcription times out.
const MAX_RECORD_MS = 60_000;
// The level must stay below the threshold this long before the speaker counts as
// done. A Bluetooth mic sits close to the threshold, and without this every dip
// between words fired a "speech ended" snapshot — one answer spawned ten
// transcriptions at once and they all timed out.
const SILENCE_CONFIRM_MS = 400;
const SILENCE_THRESHOLD = 5; // RMS ×100 over [-1, 1]
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
  rmsMin: number | null; // noise floor seen by silence detection (threshold is 5)
  rmsMax: number | null;
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
  return { track: null, contextRate: null, mimeType: null, decodedRate: null, rmsMin: null, rmsMax: null, speechDetected: false, speechEnds: 0, mutedAtStart: null, muteEvents: 0, unmuteEvents: 0 };
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
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
    onStop?: () => void,
    silenceMs = Number(process.env.NEXT_PUBLIC_SILENCE_TIMEOUT_MS) || 5000,
    hooks?: { onSpeechEnd?: (audio: Blob) => void; onSpeechResume?: () => void },
  ): Promise<void> {
    if (this.recording) return;

    // Request mic each time so the browser indicator tracks recording accurately
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
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

    // Level monitor only: nothing is captured through the graph.
    if (onStop) {
      this.audioContext = new AudioContext();
      this.diag.contextRate = this.audioContext.sampleRate;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.sourceNode.connect(this.analyser);
      this.startSilenceDetection(silenceMs);
      this.maxTimer = setTimeout(() => {
        if (this.recording && this.onSilenceStop) this.onSilenceStop();
      }, MAX_RECORD_MS);
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

    this.teardownGraph();
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
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.teardownGraph();
    this.releaseStream();
    this.recording = false;
  }

  private teardownGraph(): void {
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
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
   * Monitor audio levels and auto-stop after sustained silence,
   * but only once speech has been detected first.
   */
  private startSilenceDetection(silenceMs: number): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let speechDetected = false;
    let quietSince: number | null = null;

    const checkLevel = () => {
      if (!this.recording || !this.analyser) return;

      this.analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length) * 100;
      this.diag.rmsMin = this.diag.rmsMin === null ? rms : Math.min(this.diag.rmsMin, rms);
      this.diag.rmsMax = this.diag.rmsMax === null ? rms : Math.max(this.diag.rmsMax, rms);

      if (rms >= SILENCE_THRESHOLD) {
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
      } else if (speechDetected && !this.silenceTimer) {
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

      requestAnimationFrame(checkLevel);
    };

    checkLevel();
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
    this.analyser = null;
    this.onSpeechEnd = null;
    this.onSpeechResume = null;
  }
}
