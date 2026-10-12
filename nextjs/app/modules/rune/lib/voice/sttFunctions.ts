import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { transcribe } from "@/lib/llm/generate";

/**
 * Transcribe a spoken answer on the user's rune_stt backend: the server's Whisper
 * (default) or an OpenRouter transcription model on their own key.
 * Accepts a WAV audio Buffer and returns the transcribed text.
 */
export async function transcribeAudio(userId: string, audioBuffer: Buffer): Promise<string> {
  const run = (audio: Buffer) =>
    transcribe(userId, "rune_stt", { audio, format: "wav", language: "en" }, (wav) => withWhisperSlot(userId, () => transcribeWithWhisper(wav)));
  let transcript = cleanTranscript(await run(audioBuffer));
  // SPEED FALLBACK — Firefox for Android hands a page the microphone's samples at the
  // wrong rate once Android moves the mic to a Bluetooth headset (an 8 kHz hands-free
  // stream delivered as 16 kHz plays 2× fast and comes back as nothing or "[SOUND]").
  // The page can't see the real rate, so when the transcript is empty the same bytes
  // are re-run with the WAV header at half and then double speed and the first real
  // transcript wins.
  if (isNoSpeech(transcript)) {
    for (const factor of [0.5, 2]) {
      const retry = cleanTranscript(await run(relabelWav(audioBuffer, factor)));
      if (!isNoSpeech(retry)) {
        console.log(`[stt] speed fallback ×${factor} succeeded`);
        return retry;
      }
    }
  }
  return transcript;
}

// Strip non-speech annotations like (muffled noises), (coughing), [BLANK_AUDIO], etc.
function cleanTranscript(text: string): string {
  return text.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ").trim();
}

// Whisper's output for silence or noise: nothing, or its one-word hallucination.
function isNoSpeech(text: string): boolean {
  return text.replace(/[.\s]/g, "").toLowerCase().length === 0 || /^you\.?$/i.test(text.trim());
}

// Same samples, declared at `factor` × the header's rate: ×0.5 plays a 2×-fast
// recording at normal speed.
function relabelWav(wav: Buffer, factor: number): Buffer {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return wav;
  const out = Buffer.from(wav);
  const rate = Math.round(out.readUInt32LE(24) * factor);
  const blockAlign = out.readUInt16LE(32) || 2;
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * blockAlign, 28);
  return out;
}

const KEEP_MAX = 10;

// Recordings worth a listen are kept (newest few per folder): ones Whisper failed on
// (stt-failed), and ones that came back near-empty or took unusually long
// (stt-suspect) — the Bluetooth-headset bug produces both.
async function keepRecording(path: string, folder: string): Promise<void> {
  const dir = join(process.cwd(), ".tmp", folder);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(path, join(dir, path.split("/").pop()!));
    const files = await Promise.all(
      (await fs.readdir(dir)).map(async (name) => ({ name, at: (await fs.stat(join(dir, name))).mtimeMs }))
    );
    files.sort((a, b) => b.at - a.at);
    await Promise.all(files.slice(KEEP_MAX).map((f) => fs.unlink(join(dir, f.name)).catch(() => {})));
  } catch {
    console.warn(`Failed to keep STT recording: '${path}'`);
  }
}

const SUSPECT_MAX_CHARS = 5;
const SUSPECT_MIN_MS = 10_000;

// WHISPER CONCURRENCY — the box has 4 cores and one run wants them all; more than two
// at once and every run crawls into the 30 s timeout. Beyond the cap, requests wait,
// and a waiting request is dropped as soon as a newer one from the same user arrives
// (a hands-free session only ever wants its latest snapshot).
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: { userId: string; start: () => void; drop: () => void }[] = [];

export class SttSupersededError extends Error {
  constructor() {
    super("Superseded by a newer recording");
    this.name = "SttSupersededError";
  }
}

async function withWhisperSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  for (let i = waiting.length - 1; i >= 0; i -= 1) {
    if (waiting[i].userId === userId) waiting.splice(i, 1)[0].drop();
  }
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve, reject) => {
      waiting.push({ userId, start: resolve, drop: () => reject(new SttSupersededError()) });
    });
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    waiting.shift()?.start();
  }
}

/**
 * Transcribe an audio file using the Whisper CLI binary.
 */
async function transcribeWithWhisper(audioBuffer: Buffer): Promise<string> {
  const whisperBinary = process.env.WHISPER_BINARY_PATH;
  const whisperModel = process.env.WHISPER_MODEL_PATH;

  if (!whisperBinary) {
    throw new Error("WHISPER_BINARY_PATH environment variable is not set");
  }
  if (!whisperModel) {
    throw new Error("WHISPER_MODEL_PATH environment variable is not set");
  }

  // Write audio to a temp WAV file
  const tempDir = join(process.cwd(), ".tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const inputPath = join(tempDir, `stt-${randomUUID()}.wav`);
  let keep: string | null = null;
  const started = Date.now();

  try {
    await fs.writeFile(inputPath, audioBuffer);

    // Run whisper-cli.
    //
    // Decoding flags are tuned for latency: the default beam search (-bs 5 -bo 5)
    // plus temperature fallback costs ~10% for no measurable accuracy gain on the
    // short, single-utterance answers this transcribes. Model choice dominates
    // everything else — measured on a 3.9s answer (min of 3):
    //   ggml-tiny.en  0.50s   ggml-base.en  1.04s   ggml-small.en  3.71s
    // base.en is the default (see WHISPER_MODEL_PATH); small.en is accurate but
    // its real-time factor of ~0.9 makes long answers miss the latency budget even
    // with the head-start below. Transcription is kicked off the moment speech ends
    // rather than when the silence timer expires (see audioRecorder.ts), so on a
    // normal answer this whole step finishes inside the silence window and costs
    // nothing on the critical path.
    const transcript = await new Promise<string>((resolve, reject) => {
      const proc = spawn(whisperBinary, [
        "-m", whisperModel,
        "-f", inputPath,
        "--no-timestamps",
        "-np", // No prints except results
        "-l", "en", // Skip language detection
        "-t", process.env.WHISPER_THREADS || "4",
        "-bs", "1", // Greedy decode
        "-bo", "1",
        "-nf", // No temperature fallback retries
      ], {
        timeout: 30000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        reject(new Error(`Whisper process error: ${error.message}`));
      });

      proc.on("close", (code, signal) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          keep = "stt-failed";
          reject(new Error(`Whisper exited with code ${code}${signal ? ` (${signal})` : ""}: ${stderr}`));
        }
      });
    });

    const ms = Date.now() - started;
    const cleaned = transcript.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ").trim();
    if (cleaned.length <= SUSPECT_MAX_CHARS || ms >= SUSPECT_MIN_MS) keep = "stt-suspect";
    console.log(`[stt] whisper ${ms}ms chars=${cleaned.length} file=${inputPath.split("/").pop()}${keep ? ` kept=${keep}` : ""}`);
    return transcript;

  } finally {
    // A recording Whisper couldn't handle is kept (newest few) for diagnosis.
    if (keep) await keepRecording(inputPath, keep);
    // Clean up temp file
    else if (process.env.KEEP_TEMP_FILES !== "true") {
      try {
        await fs.unlink(inputPath);
      } catch {
        console.warn(`Failed to cleanup temp audio file: '${inputPath}'`);
      }
    }
  }
}
