import { getLlmTaskConfig } from "@/lib/userPreferences";
import { runClaudeCli } from "./claudeCli";
import { openRouterChat } from "./openrouter";
import { taskDef, type LlmTaskId } from "./tasks";
import { recordUsage } from "./usage";
import { withOpenRouterKey } from "./userKeys";
import { LlmBackendError, redactSecrets, type LlmBackend, type LlmRequest, type LlmResult, type LlmTaskConfig } from "./types";

// ENTRY POINT for every model call in the app.
//
//   generateText(userId, task, req)      → the model's reply as text
//   generateJson(userId, task, req)      → the first JSON object in the reply (1 retry)
//   generateWithTools(userId, task, req) → an agentic call (req.tools) → text
//
// The backend is the user's choice for that task (Settings → AI): the shared Claude
// CLI, or OpenRouter with the user's own key. A task on OpenRouter with no key, or an
// OpenRouter failure, raises LlmBackendError — it is never retried on the CLI. Every
// call, success or failure, writes one llm_usage row for the Usage page.

export interface ResolvedBackend extends LlmTaskConfig {
  model: string; // the model that will be used (OpenRouter id, or the CLI alias/default)
}

export async function resolveBackend(userId: string, task: LlmTaskId): Promise<ResolvedBackend> {
  const def = taskDef(task);
  const config = await getLlmTaskConfig(userId, task);
  if (config.backend === "openrouter") {
    return { backend: "openrouter", model: config.model?.trim() || def.openRouterModel };
  }
  if (def.openRouterOnly) {
    // Can't happen through the settings UI; a hand-edited row lands here.
    return { backend: "openrouter", model: def.openRouterModel };
  }
  return { backend: "claude", model: def.cliModel ?? "default" };
}

// True when the task will run on OpenRouter — lets a call site skip CLI-only work
// (the rune eval worker warm-up) without resolving twice.
export async function usesOpenRouter(userId: string, task: LlmTaskId): Promise<boolean> {
  return (await resolveBackend(userId, task)).backend === "openrouter";
}

function errorCodeOf(error: unknown): string {
  return error instanceof LlmBackendError ? error.code : "unknown";
}

export async function generate(userId: string, task: LlmTaskId, req: LlmRequest): Promise<LlmResult> {
  const def = taskDef(task);
  const resolved = await resolveBackend(userId, task);
  const started = Date.now();
  let backend: LlmBackend = resolved.backend;
  let model = resolved.model;

  try {
    if (backend === "openrouter") {
      const result = await withOpenRouterKey(userId, (key) =>
        openRouterChat(key, {
          model: resolved.model,
          system: req.system,
          prompt: req.prompt,
          images: req.images,
          json: req.json,
          tools: req.tools,
          maxRounds: req.maxRounds,
          timeoutMs: req.timeoutMs ?? (req.tools?.length ? 180_000 : 60_000),
        })
      );
      model = result.model;
      const durationMs = Date.now() - started;
      recordUsage({ userId, task, backend, model, ...result.usage, durationMs, ok: true, errorCode: null });
      console.log(`[llm] ${task} openrouter ${model} ${durationMs}ms ${result.usage.promptTokens}+${result.usage.completionTokens} tok $${(result.usage.costUsd ?? 0).toFixed(5)}`);
      return { text: result.text, backend, model, usage: result.usage, durationMs };
    }

    const cli = { ...req.cli };
    if (def.cliModel && !cli.model) cli.model = def.cliModel;
    if (def.cliEffort && !cli.effort) cli.effort = def.cliEffort;
    const result = await runClaudeCli({ system: req.system, prompt: req.prompt, images: req.images, timeoutMs: req.timeoutMs, cli });
    model = result.model;
    const durationMs = Date.now() - started;
    recordUsage({ userId, task, backend, model, ...result.usage, durationMs, ok: true, errorCode: null });
    console.log(`[llm] ${task} claude ${model} ${durationMs}ms ${result.usage.promptTokens}+${result.usage.completionTokens} tok`);
    return { text: result.text, backend, model, usage: result.usage, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    recordUsage({ userId, task, backend, model, promptTokens: 0, completionTokens: 0, costUsd: null, durationMs, ok: false, errorCode: errorCodeOf(error) });
    if (error instanceof LlmBackendError) throw error;
    throw new LlmBackendError(backend === "openrouter" ? "openrouter_error" : "claude_cli_error", redactSecrets(error instanceof Error ? error.message : String(error)));
  }
}

export async function generateText(userId: string, task: LlmTaskId, req: LlmRequest): Promise<string> {
  return (await generate(userId, task, req)).text;
}

// Pulls the first JSON value out of a reply. Models are asked for bare JSON but still
// wrap it in a fence or a sentence now and then.
export function extractJson(reply: string): unknown {
  const cleaned = reply.replace(/```(?:json)?/gi, "").trim();
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = isArray ? arrStart : objStart;
  const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmBackendError("bad_response", "No JSON in the model's reply");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new LlmBackendError("bad_response", `The model's JSON didn't parse: ${cleaned.slice(start, start + 120)}`);
  }
}

// One retry on an unparseable reply (rare, and almost always fine the second time).
export async function generateJson(userId: string, task: LlmTaskId, req: LlmRequest): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await generate(userId, task, { ...req, json: true });
    try {
      return extractJson(result.text);
    } catch (error) {
      lastError = error;
      console.warn(`[llm] ${task} attempt ${attempt}: reply was not JSON`);
    }
  }
  throw lastError;
}

export async function generateWithTools(userId: string, task: LlmTaskId, req: LlmRequest): Promise<string> {
  return (await generate(userId, task, req)).text;
}
