// LLM LAYER — shared types. Every model call in the app goes through lib/llm/generate.ts,
// which picks one of two backends per user and per task:
//   claude      — the shared `claude` CLI (the owner's subscription), the default
//   openrouter  — the calling user's own OpenRouter key (lib/llm/userKeys.ts)
// There is deliberately no app-wide OpenRouter key and no fallback from one backend to
// the other: a task set to OpenRouter fails loudly when the user has no key.

export type LlmBackend = "claude" | "openrouter";
export const LLM_BACKENDS: readonly LlmBackend[] = ["claude", "openrouter"];

export function isLlmBackend(value: unknown): value is LlmBackend {
  return typeof value === "string" && (LLM_BACKENDS as string[]).includes(value);
}

// How the settings page orders a task's model dropdown.
export type LlmModelSort = "name" | "price" | "speed" | "release";
export const LLM_MODEL_SORTS: readonly LlmModelSort[] = ["name", "price", "speed", "release"];

export function isLlmModelSort(value: unknown): value is LlmModelSort {
  return typeof value === "string" && (LLM_MODEL_SORTS as string[]).includes(value);
}

// One user's choice for one task: the backend, an optional model (an OpenRouter id
// such as "anthropic/claude-haiku-4.5", or a CLI alias / full id), and the order
// they last chose for that task's dropdown.
export interface LlmTaskConfig {
  backend: LlmBackend;
  model?: string;
  sort?: LlmModelSort;
}

// An image handed to a vision call: a file on this box. The OpenRouter backend
// inlines it as base64; the CLI backend has the model read the path itself.
export interface LlmImage {
  path: string;
}

// A tool the model may call during an agentic request (OpenRouter function calling).
// `parameters` is a JSON schema object. `execute` returns the text the model sees.
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// CLI-only knobs, so a call site migrated onto the layer keeps the exact flags it
// used before (model alias, effort, tool allow-list, cwd, thinking off, output file).
export interface ClaudeCliOptions {
  model?: string;          // "haiku" | "sonnet" | "opus"
  effort?: string;         // "low" | "medium" | "high"
  tools?: string;          // --tools value ("" disables every tool)
  allowedTools?: string;   // --allowedTools value
  permissionMode?: string; // --permission-mode value
  cwd?: string;            // defaults to the process cwd
  noThinking?: boolean;    // MAX_THINKING_TOKENS=0
  shell?: boolean;         // spawn with shell: true (some call sites do)
  // When set, the model is expected to WRITE its answer to this path (agentic call
  // sites); the file's content is returned as the result text and the file removed.
  outputFile?: string;
}

export interface LlmRequest {
  system?: string;
  prompt: string;
  images?: LlmImage[];
  timeoutMs?: number;
  // Ask for a JSON object. OpenRouter gets response_format json_object; the CLI is
  // told nothing extra (prompts already demand JSON) — callers parse either way.
  json?: boolean;
  tools?: LlmTool[];
  maxRounds?: number;
  cli?: ClaudeCliOptions;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export interface LlmResult {
  text: string;
  backend: LlmBackend;
  model: string;
  usage: LlmUsage;
  durationMs: number;
}

export type LlmErrorCode =
  | "openrouter_key_missing"
  | "openrouter_auth"
  | "openrouter_credits"
  | "openrouter_rate_limited"
  | "openrouter_timeout"
  | "openrouter_error"
  | "openrouter_tool_rounds"
  | "claude_cli_error"
  | "bad_response";

// Thrown by the layer for every backend failure. `status` is the HTTP status a
// route should answer with; `code` is stable for the client.
export class LlmBackendError extends Error {
  code: LlmErrorCode;
  status: number;
  constructor(code: LlmErrorCode, message: string, status = 502) {
    super(message);
    this.name = "LlmBackendError";
    this.code = code;
    this.status = status;
  }
}

// Strip anything that looks like an OpenRouter key from text headed for a log or an
// error message. Applied to every upstream message the layer re-throws.
export function redactSecrets(text: string): string {
  return text.replace(/sk-or-[A-Za-z0-9_-]+/g, "sk-or-…");
}
