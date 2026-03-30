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

    // Run whisper-cli
    const transcript = await new Promise<string>((resolve, reject) => {
      const proc = spawn(whisperBinary, [
        "-m", whisperModel,
        "-f", inputPath,
        "--no-timestamps",
        "-np", // No prints except results
        "-l", "en", // Skip language detection
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

    return transcript;

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
