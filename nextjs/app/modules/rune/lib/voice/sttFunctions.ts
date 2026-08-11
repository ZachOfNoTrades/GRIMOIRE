import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Transcribe an audio file using the Whisper CLI binary.
 * Accepts a WAV audio Buffer and returns the transcribed text.
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
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

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Whisper exited with code ${code}: ${stderr}`));
        }
      });
    });

    // Strip non-speech annotations like (muffled noises), (coughing), [BLANK_AUDIO], etc.
    const cleaned = transcript.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ").trim();
    return cleaned;

  } finally {
    // Clean up temp file
    if (process.env.KEEP_TEMP_FILES !== "true") {
      try {
        await fs.unlink(inputPath);
      } catch {
        console.warn(`Failed to cleanup temp audio file: '${inputPath}'`);
      }
    }
  }
}
