import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// Persistent Piper TTS process.
//
// Piper pays ~0.5s loading the voice model on every spawn, and the old one-shot
// path paid it on every single utterance. Worse, a cold spawn (voice not yet in
// page cache) measured a real-time factor of 1.16 on this box — synthesis slower
// than the speech it produces — which alone blew the voice loop's latency budget.
//
// Keeping one long-lived process with the voice resident removes both costs.
// Measured here (min of 3, en_US-lessac-medium, ~7s of speech):
//   one-shot spawn, cold : 7.9s   (RTF 1.16)
//   one-shot spawn, warm : 0.64s  (RTF 0.09)
//   persistent process   : 0.36s  (RTF 0.06)
//
// Piper's `--json-input` mode is what makes this safe to multiplex: it reads one
// JSON object per line and prints the finished output path as one line on stdout,
// so requests and responses pair up strictly in order. (`--output_raw` streams
// audio with no delimiter between utterances, so it cannot be demultiplexed on a
// shared process.)

// Voice model. Defaults to PIPER_MODEL_PATH; the voice tier matters a lot for
// latency — lessac-medium synthesizes at RTF ~0.06 vs lessac-high at ~0.30, and
// high is too slow to keep the answer→speech path under budget on this CPU.
const MODEL_PATH = () => process.env.PIPER_MODEL_PATH;
// Kill the process after this long with no synthesis, so an idle study session
// doesn't hold ~200MB of voice model resident on a RAM-tight box.
const IDLE_MS = 5 * 60 * 1000;
// Hard cap on a single utterance before we tear the process down and respawn.
const SYNTH_TIMEOUT_MS = 30000;

type Job = {
  outputPath: string;
  resolve: (path: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class PiperEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  // Piper answers in request order, so a FIFO pairs each stdout line with its job.
  private queue: Job[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private spawnProc(): ChildProcessWithoutNullStreams {
    const binary = process.env.PIPER_BINARY_PATH;
    const model = MODEL_PATH();
    if (!binary) throw new Error("PIPER_BINARY_PATH environment variable is not set");
    if (!model) throw new Error("PIPER_MODEL_PATH environment variable is not set");

    const proc = spawn(
      binary,
      [
        "--model", model,
        "--json-input", // one JSON request per line; one output path per line back
        "--output_dir", tmpdir(),
        "--length_scale", process.env.PIPER_LENGTH_SCALE || "1.0",
        "--sentence_silence", process.env.PIPER_SENTENCE_SILENCE || "0.2",
        "-q", // suppress the per-utterance info logging
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    proc.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    proc.stderr.on("data", () => { /* diagnostics only; failures surface as a dead proc */ });
    proc.on("close", () => this.onExit(proc, "Piper process exited"));
    proc.on("error", (err) => this.onExit(proc, `Piper process error: ${err.message}`));

    this.proc = proc;
    this.stdoutBuffer = "";
    return proc;
  }

  /** Each stdout line is the finished output path for the oldest outstanding job. */
  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString();
    let nl: number;
    while ((nl = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, nl).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
      if (!line) continue;
      const job = this.queue.shift();
      if (!job) continue; // stray output (e.g. after a timeout dropped the job)
      clearTimeout(job.timer);
      job.resolve(job.outputPath);
    }
  }

  /** Fail every outstanding job — the next call respawns. */
  private onExit(proc: ChildProcessWithoutNullStreams, reason: string): void {
    if (this.proc !== proc) return; // superseded by a newer process
    this.proc = null;
    const pending = this.queue;
    this.queue = [];
    for (const job of pending) {
      clearTimeout(job.timer);
      job.reject(new Error(reason));
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_MS);
    this.idleTimer.unref?.();
  }

  /** Synthesize `text` to a WAV file and resolve with its path. */
  synthesize(text: string): Promise<string> {
    this.resetIdleTimer();
    const proc = this.proc ?? this.spawnProc();
    const outputPath = join(tmpdir(), `rune-tts-${randomUUID()}.wav`);

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Drop this job and restart: a stuck utterance would desynchronize the
        // FIFO for every job behind it.
        this.queue = this.queue.filter((j) => j.timer !== timer);
        this.dispose();
        reject(new Error("Piper synthesis timed out"));
      }, SYNTH_TIMEOUT_MS);

      this.queue.push({ outputPath, resolve, reject, timer });
      // JSON.stringify can never emit a raw newline, so one request is always one line.
      proc.stdin.write(JSON.stringify({ text, output_file: outputPath }) + "\n");
    });
  }

  dispose(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try { proc.stdin.end(); } catch { /* already closed */ }
      try { proc.kill(); } catch { /* already gone */ }
    }
    const pending = this.queue;
    this.queue = [];
    for (const job of pending) {
      clearTimeout(job.timer);
      job.reject(new Error("Piper process disposed"));
    }
  }
}

// Persist the engine on globalThis so dev hot-reloads reuse the running process
// instead of orphaning it — same singleton pattern as the DB pools and evalWorker.
const globalStore = globalThis as unknown as {
  __runePiper?: PiperEngine;
  __runePiperExitHooked?: boolean;
};
const engine: PiperEngine = globalStore.__runePiper ?? (globalStore.__runePiper = new PiperEngine());

if (!globalStore.__runePiperExitHooked) {
  globalStore.__runePiperExitHooked = true;
  const kill = () => engine.dispose();
  process.once("exit", kill);
  process.once("SIGTERM", kill);
  process.once("SIGINT", kill);
}

/**
 * Synthesize text to speech using Piper.
 * Returns the audio as a base64-encoded WAV data URL.
 */
export async function synthesizeSpeech(text: string): Promise<string> {
  let outputPath: string;
  try {
    outputPath = await engine.synthesize(text);
  } catch (error) {
    // A dead or wedged persistent process must never block speech — fall back to
    // the one-shot spawn, which is slower but self-contained.
    console.warn(`[TTS] Persistent Piper failed, falling back to one-shot spawn: ${error instanceof Error ? error.message : error}`);
    outputPath = await synthesizeOneShot(text);
  }

  try {
    const audioBuffer = await fs.readFile(outputPath);
    return `data:audio/wav;base64,${audioBuffer.toString("base64")}`;
  } finally {
    if (process.env.KEEP_TEMP_FILES !== "true") {
      try {
        await fs.unlink(outputPath);
      } catch {
        console.warn(`Failed to cleanup temp audio file: '${outputPath}'`);
      }
    }
  }
}

/** Pre-load the voice model so the first real utterance isn't the slow one. */
export async function warmSynthesizer(): Promise<void> {
  try {
    const path = await engine.synthesize("ready");
    if (process.env.KEEP_TEMP_FILES !== "true") await fs.unlink(path).catch(() => { });
  } catch {
    // Best-effort: a failure just means the first real utterance pays the load.
  }
}

/** One-shot Piper spawn — the fallback path when the persistent process is unusable. */
function synthesizeOneShot(text: string): Promise<string> {
  const binary = process.env.PIPER_BINARY_PATH;
  const model = MODEL_PATH();
  if (!binary) throw new Error("PIPER_BINARY_PATH environment variable is not set");
  if (!model) throw new Error("PIPER_MODEL_PATH environment variable is not set");

  const outputPath = join(tmpdir(), `rune-tts-${randomUUID()}.wav`);

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(binary, [
      "--model", model,
      "--output_file", outputPath,
      "--length_scale", process.env.PIPER_LENGTH_SCALE || "1.0",
      "--sentence_silence", process.env.PIPER_SENTENCE_SILENCE || "0.2",
      "-q",
    ], { timeout: SYNTH_TIMEOUT_MS });

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    proc.on("error", (error) => reject(new Error(`Piper process error: ${error.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`Piper exited with code ${code}: ${stderr}`));
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}
