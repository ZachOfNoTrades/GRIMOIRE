const SAMPLE_RATE = 16000; // Whisper expects 16kHz

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private recording = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceStop: (() => void) | null = null;

  /** Request microphone permission and prepare the stream. */
  async requestPermission(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start recording audio from the microphone.
   * Captures raw PCM at 16kHz mono for direct Whisper consumption.
   * Auto-stops after `silenceMs` of silence if `onStop` is provided.
   */
  startRecording(
    onStop?: () => void,
    silenceMs = Number(process.env.NEXT_PUBLIC_SILENCE_TIMEOUT_MS) || 5000,
  ): void {
    if (!this.stream || this.recording) return;

    this.pcmChunks = [];
    this.recording = true;
    this.onSilenceStop = onStop ?? null;

    // Create AudioContext at 16kHz to avoid resampling
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Capture raw PCM samples via ScriptProcessorNode
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (event) => {
      if (!this.recording) return;
      const inputData = event.inputBuffer.getChannelData(0);
      this.pcmChunks.push(new Float32Array(inputData));
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // Set up silence detection
    if (onStop) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.sourceNode.connect(this.analyser);
      this.startSilenceDetection(silenceMs);
    }
  }

  /** Stop recording and return the audio as a WAV Blob. */
  async stopRecording(): Promise<Blob> {
    if (!this.recording) return new Blob([]);

    this.stopSilenceDetection();
    this.recording = false;

    // Disconnect audio nodes
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    await this.audioContext?.close();
    this.audioContext = null;

    // Merge PCM chunks into a single buffer
    const totalLength = this.pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    // Encode as WAV
    return this.encodeWav(pcm, SAMPLE_RATE);
  }

  isRecording(): boolean {
    return this.recording;
  }

  /** Release microphone stream. */
  dispose(): void {
    this.stopSilenceDetection();
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.audioContext?.close();
    this.audioContext = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.recording = false;
  }

  /** Encode Float32Array PCM data as a WAV file Blob. */
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

  /** Monitor audio levels and auto-stop on sustained silence. */
  private startSilenceDetection(silenceMs: number): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const silenceThreshold = 10;

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

      if (rms < silenceThreshold) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            if (this.recording && this.onSilenceStop) {
              this.onSilenceStop();
            }
          }, silenceMs);
        }
      } else {
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      }

      requestAnimationFrame(checkLevel);
    };

    checkLevel();
  }

  private stopSilenceDetection(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.analyser = null;
  }
}
