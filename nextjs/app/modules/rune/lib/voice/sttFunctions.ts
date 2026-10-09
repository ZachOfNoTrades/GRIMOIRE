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
  const transcript = await transcribe(userId, "rune_stt", { audio: audioBuffer, format: "wav", language: "en" }, transcribeWithWhisper);
  // Strip non-speech annotations like (muffled noises), (coughing), [BLANK_AUDIO], etc.
  return transcript.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ").trim();
}

const FAILED_DIR = join(process.cwd(), ".tmp", "stt-failed");
const FAILED_KEEP = 10;

async function keepFailedRecording(path: string): Promise<void> {
  try {
    await fs.mkdir(FAILED_DIR, { recursive: true });
    await fs.rename(path, join(FAILED_DIR, path.split("/").pop()!));
    const files = await Promise.all(
      (await fs.readdir(FAILED_DIR)).map(async (name) => ({ name, at: (await fs.stat(join(FAILED_DIR, name))).mtimeMs }))
    );
    files.sort((a, b) => b.at - a.at);
    await Promise.all(files.slice(FAILED_KEEP).map((f) => fs.unlink(join(FAILED_DIR, f.name)).catch(() => {})));
  } catch {
    console.warn(`Failed to keep failed STT recording: '${path}'`);
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
  let failed = false;

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
          failed = true;
          reject(new Error(`Whisper exited with code ${code}${signal ? ` (${signal})` : ""}: ${stderr}`));
        }
      });
    });

    return transcript;

  } finally {
    // A recording Whisper couldn't handle is kept (newest few) for diagnosis.
    if (failed) await keepFailedRecording(inputPath);
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
