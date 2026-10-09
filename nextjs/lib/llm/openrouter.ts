import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import { LlmBackendError, redactSecrets, type LlmImage, type LlmTool, type LlmUsage } from "./types";

// OPENROUTER BACKEND — one chat-completions request (plus a function-calling loop when
// tools are given) against https://openrouter.ai/api/v1 with the CALLING USER'S key.
// The key arrives as a parameter from lib/llm/userKeys.ts `withOpenRouterKey` and is
// used for the Authorization header only; it is never logged, and every error message
// that leaves this file goes through redactSecrets().

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ROUNDS = 6;
const MAX_IMAGE_EDGE = 1600;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  model?: string;
  choices?: { message: ChatMessage; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number | string };
}

export interface OpenRouterChatRequest {
  model: string;
  system?: string;
  prompt: string;
  images?: LlmImage[];
  json?: boolean;
  tools?: LlmTool[];
  maxRounds?: number;
  timeoutMs?: number;
}

export interface OpenRouterChatResult {
  text: string;
  model: string;
  usage: LlmUsage;
}

// Shrink a photo so a label shot from a phone (several MB) doesn't become a multi-MB
// request. ImageMagick's `convert` is already a forage dependency (label OCR).
async function imageToDataUrl(image: LlmImage): Promise<string> {
  const out = join(tmpdir(), `llm-img-${randomUUID()}.jpg`);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "convert",
        [image.path, "-auto-orient", "-resize", `${MAX_IMAGE_EDGE}x${MAX_IMAGE_EDGE}>`, "-quality", "85", out],
        { timeout: 20_000 },
        (error) => (error ? reject(error) : resolve())
      );
    });
    const buf = await readFile(out);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    // No ImageMagick or an odd format: send the original bytes as-is.
    const buf = await readFile(image.path);
    const ext = image.path.toLowerCase().split(".").pop();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } finally {
    unlink(out).catch(() => {});
  }
}

function errorFor(status: number, body: string): LlmBackendError {
  const detail = redactSecrets(body).slice(0, 300);
  if (status === 401 || status === 403) return new LlmBackendError("openrouter_auth", "OpenRouter rejected the stored key", 502);
  if (status === 402) return new LlmBackendError("openrouter_credits", "OpenRouter account is out of credits", 502);
  if (status === 429) return new LlmBackendError("openrouter_rate_limited", "OpenRouter rate limit hit — try again shortly", 503);
  return new LlmBackendError("openrouter_error", `OpenRouter answered ${status}: ${detail}`, 502);
}

async function post<T extends { error?: { message?: string; code?: number | string } }>(key: string, path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://grimoire.zsmith.io",
        "X-OpenRouter-Title": "GRIMOIRE",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new LlmBackendError("openrouter_timeout", "OpenRouter did not answer in time", 504);
    throw new LlmBackendError("openrouter_error", `OpenRouter is unreachable: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
  }
  const text = await response.text();
  if (!response.ok) throw errorFor(response.status, text);
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new LlmBackendError("bad_response", "OpenRouter returned something that isn't JSON");
  }
  // A 200 can still carry an error object (provider-side failure mid-stream).
  if (parsed.error) throw errorFor(typeof parsed.error.code === "number" ? parsed.error.code : 502, parsed.error.message ?? "");
  return parsed;
}

// One request with a single retry on a rate limit or an upstream 5xx.
async function postWithRetry<T extends { error?: { message?: string; code?: number | string } }>(key: string, path: string, body: unknown, signal: AbortSignal): Promise<T> {
  try {
    return await post<T>(key, path, body, signal);
  } catch (error) {
    const retryable = error instanceof LlmBackendError && (error.code === "openrouter_rate_limited" || (error.code === "openrouter_error" && /answered 5\d\d/.test(error.message)));
    if (!retryable || signal.aborted) throw error;
    await new Promise((r) => setTimeout(r, 1500));
    return post<T>(key, path, body, signal);
  }
}

export async function openRouterChat(key: string, req: OpenRouterChatRequest): Promise<OpenRouterChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const userContent: ContentPart[] = [{ type: "text", text: req.prompt }];
    for (const image of req.images ?? []) {
      userContent.push({ type: "image_url", image_url: { url: await imageToDataUrl(image) } });
    }
    const messages: ChatMessage[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: userContent.length === 1 ? req.prompt : userContent });

    const toolDefs = (req.tools ?? []).map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    const toolsByName = new Map((req.tools ?? []).map((t) => [t.name, t]));

    const usage: LlmUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };
    let model = req.model;
    const maxRounds = req.tools?.length ? (req.maxRounds ?? DEFAULT_MAX_ROUNDS) : 1;

    for (let round = 0; round < maxRounds; round += 1) {
      const body: Record<string, unknown> = {
        model: req.model,
        messages,
        usage: { include: true },
        provider: { sort: "latency" },
      };
      if (req.json && !toolDefs.length) body.response_format = { type: "json_object" };
      if (toolDefs.length) body.tools = toolDefs;

      const response = await postWithRetry<ChatResponse>(key, "/chat/completions", body, controller.signal);
      const choice = response.choices?.[0];
      if (!choice) throw new LlmBackendError("bad_response", "OpenRouter returned no choices");
      if (response.model) model = response.model;
      usage.promptTokens += response.usage?.prompt_tokens ?? 0;
      usage.completionTokens += response.usage?.completion_tokens ?? 0;
      if (typeof response.usage?.cost === "number") usage.costUsd = (usage.costUsd ?? 0) + response.usage.cost;

      const calls = choice.message.tool_calls ?? [];
      if (!calls.length) {
        const content = choice.message.content;
        const text = typeof content === "string" ? content : (content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
        return { text, model, usage };
      }

      // Tool round: echo the assistant turn, run each call, feed the results back.
      messages.push({ role: "assistant", content: choice.message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const tool = toolsByName.get(call.function.name);
        let result: string;
        if (!tool) {
          result = JSON.stringify({ success: false, error: `Unknown tool '${call.function.name}'` });
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
          } catch {
            result = JSON.stringify({ success: false, error: "Tool arguments were not valid JSON" });
            messages.push({ role: "tool", tool_call_id: call.id, content: result });
            continue;
          }
          try {
            result = await tool.execute(args);
          } catch (error) {
            result = JSON.stringify({ success: false, error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 500) });
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    throw new LlmBackendError("openrouter_tool_rounds", `The model kept calling tools past ${maxRounds} rounds without answering`);
  } finally {
    clearTimeout(timer);
  }
}

// TRANSCRIPTION — POST /audio/transcriptions: base64 audio in a JSON body (the endpoint
// is not OpenAI-compatible; no multipart). Duration-priced models report
// usage.seconds, token-priced ones input/output tokens; usage.cost is always there.
export interface OpenRouterTranscribeRequest {
  model: string;
  audio: Buffer;
  format: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "webm" | "aac";
  language?: string;
  timeoutMs?: number;
}

interface TranscriptionResponse {
  text?: string;
  usage?: { cost?: number; seconds?: number; input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: number | string };
}

export async function openRouterTranscribe(key: string, req: OpenRouterTranscribeRequest): Promise<OpenRouterChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
  try {
    const body: Record<string, unknown> = {
      model: req.model,
      input_audio: { data: req.audio.toString("base64"), format: req.format },
      provider: { sort: "latency" },
    };
    if (req.language) body.language = req.language;
    const response = await postWithRetry<TranscriptionResponse>(key, "/audio/transcriptions", body, controller.signal);
    if (typeof response.text !== "string") throw new LlmBackendError("bad_response", "OpenRouter returned no transcript");
    return {
      text: response.text,
      model: req.model,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        costUsd: typeof response.usage?.cost === "number" ? response.usage.cost : null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
