import { spawn } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LlmBackendError, type ClaudeCliOptions, type LlmImage, type LlmUsage } from "./types";

// CLAUDE CLI BACKEND — one `claude -p` process per call, the shared subscription.
// This is the pre-existing spawn block of every call site folded into one place; the
// per-site flags (model alias, effort, tool allow-list, cwd, thinking off, output file)
// come in through ClaudeCliOptions so behavior stays what it was. The one change: the
// CLI is asked for `--output-format json` so its token counts and cost can be logged.

export interface ClaudeCliRequest {
  system?: string;
  prompt: string;
  images?: LlmImage[]; // listed by path at the end of the prompt — the model Reads them
  timeoutMs?: number;
  cli?: ClaudeCliOptions;
}

export interface ClaudeCliResult {
  text: string;
  model: string;
  usage: LlmUsage;
}

const DEFAULT_TIMEOUT_MS = 60_000;

// An empty MCP config makes the CLI skip connecting to MCP servers (2-3 s per spawn).
// Written once; passed by path to avoid shell-quoting a JSON literal.
const EMPTY_MCP_CONFIG_PATH = join(tmpdir(), "grimoire-llm-empty-mcp.json");
function emptyMcpConfigPath(): string {
  if (!existsSync(EMPTY_MCP_CONFIG_PATH)) writeFileSync(EMPTY_MCP_CONFIG_PATH, '{"mcpServers":{}}');
  return EMPTY_MCP_CONFIG_PATH;
}

interface CliJson {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
  modelUsage?: Record<string, unknown>;
}

// The CLI reports the alias it ran as nowhere directly; modelUsage is keyed by the
// full model id, and the one that did the work is the one with output tokens.
function modelFrom(json: CliJson, fallback: string): string {
  const entries = Object.entries(json.modelUsage ?? {}) as [string, { outputTokens?: number }][];
  const main = entries.sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0))[0];
  return main?.[0] ?? fallback;
}

export async function runClaudeCli(req: ClaudeCliRequest): Promise<ClaudeCliResult> {
  const cli = req.cli ?? {};
  const args = ["-p", "--output-format", "json", "--no-session-persistence"];
  // Tool-using calls need the real MCP-less default config too; agentic call sites
  // never relied on MCP servers, only on the built-in Write/Bash/Read tools.
  args.push("--strict-mcp-config", "--mcp-config", emptyMcpConfigPath());
  if (cli.model) args.push("--model", cli.model);
  if (cli.effort) args.push("--effort", cli.effort);
  if (cli.tools !== undefined) args.push("--tools", cli.tools);
  if (cli.allowedTools) args.push("--allowedTools", cli.allowedTools);
  if (cli.permissionMode) args.push("--permission-mode", cli.permissionMode);
  if (req.system) args.push("--system-prompt", req.system);

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (cli.noThinking) env.MAX_THINKING_TOKENS = "0";

  let prompt = req.prompt;
  if (req.images?.length) {
    prompt += `\n\nImage files to read:\n${req.images.map((i, n) => `  ${n + 1}. ${i.path}`).join("\n")}`;
  }

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const modelLabel = `claude-cli:${cli.model ?? "default"}`;

  const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd: cli.cwd,
      timeout: timeoutMs,
      shell: cli.shell ?? false,
      env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", (error) => reject(new LlmBackendError("claude_cli_error", `Failed to start claude CLI: ${error.message}`)));
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
    proc.stdin.write(prompt);
    proc.stdin.end();
  });

  if (code !== 0) {
    throw new LlmBackendError("claude_cli_error", `claude CLI exited with code ${code}: ${(stderr || stdout).trim().slice(0, 300)}`);
  }

  let json: CliJson = {};
  try {
    json = JSON.parse(stdout) as CliJson;
  } catch {
    // Not JSON (an older CLI, or a diagnostic line first): treat stdout as the text.
    json = { result: stdout };
  }
  if (json.is_error) {
    throw new LlmBackendError("claude_cli_error", `claude CLI reported an error: ${(json.result ?? "").slice(0, 300)}`);
  }

  const usage: LlmUsage = {
    promptTokens: (json.usage?.input_tokens ?? 0) + (json.usage?.cache_creation_input_tokens ?? 0) + (json.usage?.cache_read_input_tokens ?? 0),
    completionTokens: json.usage?.output_tokens ?? 0,
    costUsd: typeof json.total_cost_usd === "number" ? json.total_cost_usd : null,
  };

  // Agentic call sites have the model write its answer to a file.
  let text = (json.result ?? "").trim();
  if (cli.outputFile) {
    if (!existsSync(cli.outputFile)) {
      throw new LlmBackendError("bad_response", `claude CLI completed but did not write ${cli.outputFile}`);
    }
    text = readFileSync(cli.outputFile, "utf-8");
    try { unlinkSync(cli.outputFile); } catch { /* best effort */ }
  }

  return { text, model: modelFrom(json, modelLabel), usage };
}
