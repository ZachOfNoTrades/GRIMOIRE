import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlink, readdirSync, readFileSync } from "fs";
import { randomUUID } from "crypto";

// Persistent Claude eval worker.
//
// `claude -p` pays ~3s of startup (config load + first model round-trip) that
// happens AFTER it reads stdin and CANNOT be overlapped by spawning early
// (verified empirically). A one-shot spawn per card therefore floors eval at ~5s.
//
// Running one long-lived `claude` process in stream-json mode pays that startup
// once, then each subsequent eval is just a model round-trip. We keep one worker
// per study session, warmed at session start so the startup hides behind the first
// card's question TTS, and recycle it every MAX_TURNS evals so accumulated
// conversation history can't slow later turns or bias grading.

// Grading model. Benchmarked on this box (warm worker, same eval prompt, min of 3):
//   sonnet 1.2s · opus 2.5s · haiku 5.0s (haiku is both slowest and wraps its JSON
//   in markdown fences). sonnet grades this task identically to opus at half the
//   latency, which is what buys the sub-3s voice loop — see ttsFunctions.ts for the
//   rest of the budget. Override with RUNE_EVAL_MODEL to A/B another model.
export const EVAL_MODEL = process.env.RUNE_EVAL_MODEL || "sonnet";

// Effort level for grading. This must be set explicitly: the CLI otherwise inherits
// `effortLevel` from ~/.claude/settings.json (currently "high"), which is tuned for
// interactive coding, not for a one-shot comparison of two short strings. Measured
// on the real evaluation prompt, sonnet, 8 turns:
//   --effort low : median 2.3-3.6s, worst 4.1s
//   --effort high: median 4.1s,     worst 16.2s
// The tail is what matters — a 16s grade stalls the whole hands-free loop. Grading
// quality is unchanged at low (same ratings and explanations across the benchmark).
export const EVAL_EFFORT = process.env.RUNE_EVAL_EFFORT || "low";

// Recycle a worker after this many turns (warm ping counts as a turn).
const MAX_TURNS = 15;
// Kill an idle worker after this long with no eval (covers sessions the client
// never explicitly disposes — e.g. a closed tab or a refresh whose beacon was lost).
const IDLE_MS = 10 * 60 * 1000;
// Hard cap on a single eval turn before we kill + respawn the worker.
const TURN_TIMEOUT_MS = 30000;
// Absolute ceiling on live workers (each is a ~150-300MB claude process). If a
// client ever fails to dispose (repeated hard refreshes), the least-recently-used
// worker is evicted so processes can never stack unbounded on this RAM-tight box.
const MAX_WORKERS = 4;

// `claude` spawns its own child node process AND setsid()s it into a new session,
// so neither signalling our direct child nor killing its process group reaches the
// grandchild (verified: group-kill returns ESRCH, grandchild survives). The only
// reliable reap is to match the grandchild by a unique token in its argv — we embed
// one per worker in the (unique) empty-MCP-config path and pkill -f that token.
const MARKER_PREFIX = "rune-eval-mcp-";

// Empty MCP config so the CLI skips connecting to MCP servers (~2-3s of startup).
// Path is unique per worker so its token identifies exactly this worker's processes.
function writeMarkedMcpConfig(marker: string): string {
  const path = join(tmpdir(), `${marker}.json`);
  writeFileSync(path, '{"mcpServers":{}}');
  return path;
}

// SIGKILL every process whose argv contains `token`, then remove that worker's
// temp config. Implemented via /proc (Linux) rather than `pkill` so it has no
// PATH dependency and can't self-match a shell command. Targeted: the token is a
// per-worker UUID, so only this worker's launcher + setsid'd grandchild match.
function reapByMarker(marker: string): void {
  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      let cmdline = "";
      try {
        cmdline = readFileSync(`/proc/${entry}/cmdline`).toString();
      } catch {
        continue; // process vanished or not readable
      }
      if (cmdline.includes(marker)) {
        try { process.kill(Number(entry), "SIGKILL"); } catch { /* already gone */ }
      }
    }
  } catch {
    /* /proc unavailable (non-Linux) — nothing we can do; idle sweep is the backstop */
  }
  unlink(join(tmpdir(), `${marker}.json`), () => { /* ignore */ });
}

class EvalWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private marker: string | null = null; // unique argv token for the current proc
  private stdoutBuffer = "";
  private turns = 0;
  private busy = false;
  lastUsed = Date.now(); // for LRU eviction
  // Called when the worker terminates for good (idle/nav/evict) so the registry
  // can drop its entry. Not called on recycle, which keeps the entry and respawns.
  onTerminate: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  // Resolver for the in-flight turn, if any.
  private pending: {
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  private spawnProc(): void {
    this.turns = 0;
    this.stdoutBuffer = "";
    const marker = `${MARKER_PREFIX}${randomUUID()}`;
    this.marker = marker;
    const proc = spawn(
      "claude",
      [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose", // required for stream-json output under --print
        "--no-session-persistence",
        "--strict-mcp-config",
        // Unique per-worker path — its token lets us reap this worker's processes.
        "--mcp-config", writeMarkedMcpConfig(marker),
        "--model", EVAL_MODEL,
        "--effort", EVAL_EFFORT,
      ],
      { cwd: tmpdir(), env: { ...process.env } }
    );
    this.proc = proc;

    proc.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    proc.stderr.on("data", () => { /* diagnostics only; ignore */ });
    proc.on("close", (code) => {
      // Fail any in-flight turn; the next runEval will respawn.
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error(`Eval worker exited (code ${code})`));
        this.pending = null;
      }
      if (this.proc === proc) {
        this.proc = null;
        // If the launcher exited on its own (crash, not via killProc, which
        // already nulls the marker), reap the marker in case the setsid'd
        // grandchild outlived it.
        if (this.marker) { reapByMarker(this.marker); this.marker = null; }
      }
      this.busy = false;
    });
    proc.on("error", (err) => {
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error(`Eval worker error: ${err.message}`));
        this.pending = null;
      }
      if (this.proc === proc) this.proc = null;
      this.busy = false;
    });
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString();
    let nl: number;
    while ((nl = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, nl);
      this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: { type?: string; subtype?: string; is_error?: boolean; result?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // non-JSON diagnostic line
      }
      if (msg.type === "result" && this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        if (msg.is_error) {
          p.reject(new Error(`Eval turn failed: ${msg.result ?? "unknown error"}`));
        } else {
          p.resolve(msg.result ?? "");
        }
      }
    }
  }

  private resetIdleTimer(): void {
    this.lastUsed = Date.now();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_MS);
  }

  /** Run a single eval turn. Serialized: callers must not overlap within a session. */
  async run(prompt: string): Promise<string> {
    this.resetIdleTimer();

    // Recycle if the conversation has grown too long — kill the process but keep
    // the registry entry and idle timer; spawnProc() below starts a fresh one.
    if (this.proc && this.turns >= MAX_TURNS) this.killProc();
    if (!this.proc) this.spawnProc();
    if (this.busy) throw new Error("Eval worker is busy with another turn");

    const proc = this.proc!;
    this.busy = true;
    this.turns += 1;

    try {
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Kill the stuck process; close handler clears state, next call respawns.
          this.dispose();
          reject(new Error("Eval turn timed out"));
        }, TURN_TIMEOUT_MS);
        this.pending = { resolve, reject, timer };
        const line = JSON.stringify({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: prompt }] },
        }) + "\n";
        proc.stdin.write(line);
      });
    } finally {
      this.busy = false;
    }
  }

  /** Kill the worker's processes (used by recycle; entry + idle timer persist). */
  private killProc(): void {
    const proc = this.proc;
    const marker = this.marker;
    this.proc = null;
    this.marker = null;
    // Close stdin so the launcher exits gracefully, then reap by marker to catch
    // the setsid'd grandchild the launcher's exit leaves behind. Reap even if the
    // proc is already gone (crash) so a surviving grandchild is still cleaned up.
    if (proc) { try { proc.stdin.end(); } catch { /* noop */ } }
    if (marker) setTimeout(() => reapByMarker(marker), 300).unref?.();
  }

  /** Terminal teardown: kill the process, stop the idle timer, deregister. */
  dispose(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.killProc();
    const cb = this.onTerminate;
    this.onTerminate = null;
    cb?.();
  }
}

// ---- Registry: one worker per study-session key -----------------------------

// Persist the registry (and the exit-handler guard) on globalThis so it survives
// dev hot-reloads — otherwise each reload of this module would create a fresh Map
// and orphan the previous module instance's live child processes. Same singleton
// pattern the codebase uses for DB pools.
const globalStore = globalThis as unknown as {
  __runeEvalWorkers?: Map<string, EvalWorker>;
  __runeEvalExitHooked?: boolean;
  __runeEvalSwept?: boolean;
};
const workers: Map<string, EvalWorker> = globalStore.__runeEvalWorkers ?? (globalStore.__runeEvalWorkers = new Map());

function getOrCreate(key: string): EvalWorker {
  let w = workers.get(key);
  if (!w) {
    w = new EvalWorker();
    w.onTerminate = () => workers.delete(key);
    workers.set(key, w);
    evictIfOverCap(key);
  }
  return w;
}

// Bound live workers: if over the cap, dispose the least-recently-used one that
// isn't the one just requested. Guards against stacked processes when a client
// fails to dispose (e.g. repeated hard refreshes).
function evictIfOverCap(keepKey: string): void {
  while (workers.size > MAX_WORKERS) {
    let lruKey: string | null = null;
    let lruTime = Infinity;
    for (const [k, w] of workers) {
      if (k === keepKey) continue;
      if (w.lastUsed < lruTime) { lruTime = w.lastUsed; lruKey = k; }
    }
    if (!lruKey) break;
    workers.get(lruKey)?.dispose(); // dispose() deregisters via onTerminate
  }
}

/** Run an eval prompt on the session's persistent worker. */
export async function runEvalOnWorker(sessionKey: string, prompt: string): Promise<string> {
  return getOrCreate(sessionKey).run(prompt);
}

/**
 * Pre-spawn + warm a session's worker so its startup overlaps the first card's
 * question TTS. A throwaway ping pays the ~3s first-turn cost up front; the first
 * real eval is then a fast warm turn.
 */
export async function warmWorker(sessionKey: string): Promise<void> {
  const w = getOrCreate(sessionKey);
  try {
    await w.run("Respond with only the word: ready");
  } catch {
    // Warming is best-effort; a failure just means the first real eval pays startup.
  }
}

/** Tear down a session's worker (called on session end). */
export function disposeWorker(sessionKey: string): void {
  const w = workers.get(sessionKey);
  if (w) {
    w.dispose();
    workers.delete(sessionKey);
  }
}

// Kill all child processes when the server process exits or the module is
// hot-replaced (dev), so we never orphan claude processes.
function killAll(): void {
  for (const w of [...workers.values()]) w.dispose(); // snapshot: dispose() mutates the map
  workers.clear();
}
// Register process-exit handlers exactly once across the process lifetime (guarded
// on globalThis so hot-reloads don't stack duplicate listeners).
if (!globalStore.__runeEvalExitHooked) {
  globalStore.__runeEvalExitHooked = true;
  process.once("exit", killAll);
  process.once("SIGTERM", killAll);
  process.once("SIGINT", killAll);
}
// Turbopack/webpack HMR in dev: dispose this module instance's workers on reload.
// With the registry on globalThis this is belt-and-suspenders, but it ensures
// child processes die promptly on reload rather than waiting for the idle timer.
const hot = (module as unknown as { hot?: { dispose(cb: () => void): void } }).hot;
if (hot) hot.dispose(killAll);

// Once per fresh process (guarded so HMR reloads don't touch live workers): sweep
// any eval workers orphaned by a previous server that crashed before cleanup.
// Safe because a fresh process starts with an empty registry, so nothing live yet.
if (!globalStore.__runeEvalSwept) {
  globalStore.__runeEvalSwept = true;
  reapByMarker(MARKER_PREFIX); // MARKER_PREFIX is a substring of every worker's token
}
