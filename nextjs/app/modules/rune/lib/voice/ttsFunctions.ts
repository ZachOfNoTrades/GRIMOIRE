import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Synthesize text to a WAV audio file using the Piper TTS binary.
 * Returns the audio as a base64-encoded data URL.
 */
export async function synthesizeSpeech(text: string): Promise<string> {
  const piperBinary = process.env.PIPER_BINARY_PATH;
  const piperModel = process.env.PIPER_MODEL_PATH;

  if (!piperBinary) {
    throw new Error("PIPER_BINARY_PATH environment variable is not set");
  }
  if (!piperModel) {
    throw new Error("PIPER_MODEL_PATH environment variable is not set");
  }

  // Write output to .tmp directory (same location as LLM generation output)
  const tempDir = join(process.cwd(), ".tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const outputPath = join(tempDir, `tts-${randomUUID()}.wav`);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(piperBinary, [
        "--model", piperModel,
        "--output_file", outputPath,
      ], {
        timeout: 30000,
      });

      let stderr = "";

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        reject(new Error(`Piper process error: ${error.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Piper exited with code ${code}: ${stderr}`));
        }
      });

      // Pipe text via stdin
      proc.stdin.write(text);
      proc.stdin.end();
    });

    // Read the WAV file and convert to base64 data URL
    const audioBuffer = await fs.readFile(outputPath);
    const base64Audio = audioBuffer.toString("base64");

    return `data:audio/wav;base64,${base64Audio}`;

  } finally {
    // Clean up temp file unless LLM_KEEP_OUTPUT is set
    if (process.env.KEEP_TEMP_FILES !== "true") {
      try {
        await fs.unlink(outputPath);
      } catch {
        console.warn(`Failed to cleanup temp audio file: '${outputPath}'`);
      }
    }
  }
}
