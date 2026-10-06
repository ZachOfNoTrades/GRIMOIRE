import { LLM_TASKS, taskDef, type LlmTaskDef, type LlmTaskId } from "./tasks";
import type { LlmBackend } from "./types";
import { getModelTimingStats, getTaskTokenStats, type ModelTimingStats, type TaskTokenStats } from "./usage";
import { getOpenRouterKeyStatus, withOpenRouterKey } from "./userKeys";
import { getRecommendedModels } from "./recommendations";

// MODEL CATALOG — what the settings page offers in each task's model dropdown, and
// how a typed-in id is checked.
//
//   claude      a fixed list: the CLI's aliases (haiku / sonnet / opus). A full id
//               ("claude-sonnet-4-6") is accepted by manual entry. The recommendation
//               per task is hardcoded (the CLI exposes no model list).
//   openrouter  OpenRouter's public /api/v1/models (no key needed, cached an hour),
//               filtered to what the task needs: images in, tools, images out. The
//               recommendation is dynamic: a short list of known-good model FAMILIES
//               per capability, the newest release of each, then the cheapest of those
//               — so a new Haiku or Flash rolls in on its own.
//
// Every entry carries an ESTIMATE for this task — "~$ per call" and seconds — built
// from the usage log: the task's average prompt/completion tokens × the model's list
// price, and the average duration of past calls on that model. Before any history
// exists the task's seed token counts stand in, and the time is derived from the
// completion size.

export interface ModelInfo {
  promptPerM: number;
  completionPerM: number;
  ctx: number;
  created: string | null;   // ISO date
  imageIn: boolean;
  imageOut: boolean;
  tools: boolean;
}

export interface CatalogModel {
  id: string;
  name: string;
  recommended: boolean;
  estCostUsd: number | null;
  estSeconds: number | null;
  // Where the estimate comes from: calls of this task in the log (tokens), and calls
  // on this very model (time, actual cost).
  basis: { taskCalls: number; modelCalls: number };
  info: ModelInfo | null;   // null for the Claude aliases
}

export interface TaskModelList {
  recommended: string;
  models: CatalogModel[];
}

export interface ValidationResult {
  ok: boolean;
  name?: string;
  reason?: string;
  model?: CatalogModel;
}

interface TaskHistory {
  tokens: TaskTokenStats;
  timing: Map<string, ModelTimingStats>;
}

async function historyFor(task: LlmTaskId, backend: LlmBackend): Promise<TaskHistory> {
  const [tokens, timing] = await Promise.all([getTaskTokenStats(task, backend), getModelTimingStats(task, backend)]);
  return { tokens, timing };
}

function tokenCounts(def: LlmTaskDef, h: TaskHistory): [number, number] {
  return h.tokens.calls > 0 ? [h.tokens.promptTokensAvg, h.tokens.completionTokensAvg] : def.estTokens;
}

// Logged model ids are what the backend reported ("claude-haiku-4-5-20251001",
// "google/gemini-3.8-flash"); an alias or id matches by family word.
function timingFor(h: TaskHistory, idOrAlias: string): ModelTimingStats | null {
  const exact = h.timing.get(idOrAlias);
  if (exact) return exact;
  const key = idOrAlias.toLowerCase();
  let best: ModelTimingStats | null = null;
  for (const [model, stats] of h.timing) {
    if (model.toLowerCase().includes(key) && (!best || stats.calls > best.calls)) best = stats;
  }
  return best;
}

// A generation-side guess when neither a logged call nor OpenRouter's own stats are
// available: a fixed round trip plus the completion at a typical streaming rate.
function fallbackSeconds(def: LlmTaskDef, completionTokens: number): number {
  const base = def.needsVision ? 2.5 : def.openRouterOnly ? 8 : 0.8;
  return base + completionTokens / 60;
}

// OPENROUTER ENDPOINT STATS — GET /models/{id}/endpoints answers with each provider's
// last-30-minute p50 latency (ms to first token) and throughput (tokens/s), but only
// to an authenticated caller, so they are fetched with the viewing user's own key and
// cached briefly. The endpoint we price is the lowest-latency healthy one, which is
// the one OpenRouter routes to under `provider.sort: "latency"` (lib/llm/openrouter.ts).
interface EndpointStats {
  latencyMs: number;
  tokensPerSec: number;
}

const STATS_TTL_MS = 30 * 60 * 1000;
const statsCache = new Map<string, { at: number; stats: EndpointStats | null }>();

async function fetchEndpointStats(id: string, key: string): Promise<EndpointStats | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/models/${id}/endpoints`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { endpoints?: { status?: number; latency_last_30m?: { p50?: number } | null; throughput_last_30m?: { p50?: number } | null }[] } };
    let best: EndpointStats | null = null;
    for (const ep of body.data?.endpoints ?? []) {
      if ((ep.status ?? 0) !== 0) continue;
      const latencyMs = ep.latency_last_30m?.p50;
      const tokensPerSec = ep.throughput_last_30m?.p50;
      if (typeof latencyMs !== "number" || typeof tokensPerSec !== "number" || tokensPerSec <= 0) continue;
      if (!best || latencyMs < best.latencyMs) best = { latencyMs, tokensPerSec };
    }
    return best;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function endpointStatsFor(ids: string[], key: string): Promise<Map<string, EndpointStats | null>> {
  const now = Date.now();
  const out = new Map<string, EndpointStats | null>();
  const missing: string[] = [];
  for (const id of ids) {
    const cached = statsCache.get(id);
    if (cached && now - cached.at < STATS_TTL_MS) out.set(id, cached.stats);
    else missing.push(id);
  }
  // A handful at a time: ~100 ms each, and the settings page asks for every task's list.
  const CONCURRENCY = 8;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((id) => fetchEndpointStats(id, key)));
    batch.forEach((id, n) => {
      statsCache.set(id, { at: now, stats: results[n] });
      out.set(id, results[n]);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CLAUDE CLI
// ---------------------------------------------------------------------------------------------

const CLAUDE_MODELS: { id: string; name: string }[] = [
  { id: "haiku", name: "Haiku" },
  { id: "sonnet", name: "Sonnet" },
  { id: "opus", name: "Opus" },
];
const CLAUDE_ALIASES = new Set(CLAUDE_MODELS.map((m) => m.id));
// Full ids the CLI accepts ("claude-sonnet-4-6", "claude-opus-5-5[1m]").
const CLAUDE_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{2,60}(\[1m\])?$/;

// An admin pin wins; otherwise the task's own alias.
async function claudeRecommendation(task: LlmTaskId): Promise<string> {
  const pinned = (await getRecommendedModels())[task]?.claude;
  return pinned ?? taskDef(task).cliModel ?? "sonnet";
}

// The CLI has no list price; its estimate is the logged cost of past calls on that
// model for this task, else unknown.
function claudeEntry(task: LlmTaskId, id: string, name: string, recommended: boolean, h: TaskHistory): CatalogModel {
  const t = timingFor(h, id);
  return {
    id,
    name,
    recommended,
    estCostUsd: t?.costUsdAvg ?? null,
    estSeconds: t ? t.durationMsAvg / 1000 : null,
    basis: { taskCalls: h.tokens.calls, modelCalls: t?.calls ?? 0 },
    info: null,
  };
}

async function claudeList(task: LlmTaskId): Promise<TaskModelList> {
  const [recommended, h] = await Promise.all([claudeRecommendation(task), historyFor(task, "claude")]);
  // A pinned full id that isn't one of the aliases is listed too, so it can be picked.
  const listed = CLAUDE_MODELS.some((m) => m.id === recommended) ? CLAUDE_MODELS : [...CLAUDE_MODELS, { id: recommended, name: recommended }];
  return {
    recommended,
    models: listed.map((m) => claudeEntry(task, m.id, m.name, m.id === recommended, h)),
  };
}

async function validateClaudeModel(id: string, task: LlmTaskId): Promise<ValidationResult> {
  const alias = CLAUDE_MODELS.find((m) => m.id === id);
  if (!alias && !CLAUDE_ID_PATTERN.test(id)) {
    return { ok: false, reason: "Use haiku, sonnet, opus, or a full Claude model id like claude-sonnet-4-6" };
  }
  const h = await historyFor(task, "claude");
  const name = alias?.name ?? id;
  return { ok: true, name, model: claudeEntry(task, id, name, false, h) };
}

// ---------------------------------------------------------------------------------------------
// OPENROUTER
// ---------------------------------------------------------------------------------------------

interface RawModel {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  expiration_date?: string | null;
  pricing?: { prompt?: string; completion?: string; image?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

interface OrModel {
  id: string;
  name: string;
  created: number;
  ctx: number;
  promptPerM: number;     // $ per million tokens
  completionPerM: number;
  imageIn: boolean;
  imageOut: boolean;
  textOut: boolean;
  tools: boolean;
}

const CATALOG_TTL_MS = 60 * 60 * 1000;
let catalogCache: { at: number; models: OrModel[] } | null = null;
let catalogInflight: Promise<OrModel[]> | null = null;

// Routers, aliases and billing variants are not models a task should pin to.
function isPseudo(id: string): boolean {
  return id.startsWith("openrouter/") || id.startsWith("typesafe/") || id.startsWith("~") || id.includes(":");
}

async function fetchCatalog(): Promise<OrModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
    if (!response.ok) throw new Error(`OpenRouter models answered ${response.status}`);
    const body = (await response.json()) as { data?: RawModel[] };
    const now = Date.now();
    const models: OrModel[] = [];
    for (const raw of body.data ?? []) {
      if (!raw.id || isPseudo(raw.id)) continue;
      if (raw.expiration_date && new Date(raw.expiration_date).getTime() < now) continue;
      const prompt = Number(raw.pricing?.prompt ?? NaN) * 1e6;
      const completion = Number(raw.pricing?.completion ?? NaN) * 1e6;
      if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;
      models.push({
        id: raw.id,
        name: raw.name ?? raw.id,
        created: raw.created ?? 0,
        ctx: raw.context_length ?? 0,
        promptPerM: prompt,
        completionPerM: completion,
        imageIn: raw.architecture?.input_modalities?.includes("image") ?? false,
        imageOut: raw.architecture?.output_modalities?.includes("image") ?? false,
        textOut: raw.architecture?.output_modalities?.includes("text") ?? true,
        tools: raw.supported_parameters?.includes("tools") ?? false,
      });
    }
    return models;
  } finally {
    clearTimeout(timer);
  }
}

export async function getOpenRouterCatalog(): Promise<OrModel[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.models;
  if (!catalogInflight) {
    catalogInflight = fetchCatalog()
      .then((models) => {
        catalogCache = { at: Date.now(), models };
        return models;
      })
      .finally(() => { catalogInflight = null; });
  }
  try {
    return await catalogInflight;
  } catch (error) {
    // A stale catalog beats none while OpenRouter is unreachable.
    if (catalogCache) return catalogCache.models;
    throw error;
  }
}

type Capability = "text" | "tools" | "vision" | "image";

function capabilityOf(def: LlmTaskDef): Capability {
  if (def.openRouterOnly) return "image";
  if (def.needsVision) return "vision";
  if (def.needsTools) return "tools";
  return "text";
}

function fits(model: OrModel, cap: Capability): boolean {
  if (cap === "image") return model.imageOut;
  if (!model.ctx || model.ctx < 16_000) return false;
  if (!model.textOut || model.imageOut) return false; // audio/image generators are not text models
  // Zero-priced entries are free tiers and experiments with their own limits, not
  // something a task should pin to.
  if (model.promptPerM <= 0 && model.completionPerM <= 0) return false;
  if (cap === "vision") return model.imageIn;
  if (cap === "tools") return model.tools;
  return true;
}

// Known-good families per capability, as regexes over the id. Order is a tie-break
// only; the pick among families is by price. Preview/lite/experimental variants are
// excluded so a recommendation is always a stable release.
const FAMILIES: Record<Capability, RegExp[]> = {
  text: [
    /^qwen\/qwen3(\.\d+)?-\d+b(-a\d+b)?-instruct(-\d+)?$/,
    /^google\/gemini-[\d.]+-flash$/,
    /^anthropic\/claude-haiku-[\d.]+$/,
    /^openai\/gpt-[\d.]+-mini$/,
    /^meta-llama\/llama-[\d.]+-\d+b-instruct$/,
    /^mistralai\/mistral-small(-[\d.]+)?$/,
  ],
  tools: [
    /^anthropic\/claude-haiku-[\d.]+$/,
    /^google\/gemini-[\d.]+-flash$/,
    /^openai\/gpt-[\d.]+-mini$/,
    /^qwen\/qwen3(\.\d+)?-\d+b(-a\d+b)?-instruct(-\d+)?$/,
  ],
  vision: [
    /^google\/gemini-[\d.]+-flash$/,
    /^anthropic\/claude-haiku-[\d.]+$/,
    /^openai\/gpt-[\d.]+-mini$/,
  ],
  image: [
    /^google\/gemini-[\d.]+-flash-image$/,
    /^openai\/gpt-[\d.]+-image-mini$/,
  ],
};

function blendedPrice(m: OrModel): number {
  return m.promptPerM * 0.75 + m.completionPerM * 0.25;
}

// An admin pin wins when it is a model that fits the task; otherwise the family rule.
function recommend(models: OrModel[], cap: Capability, fallback: string, pinned?: string): string {
  if (pinned && models.some((m) => m.id === pinned)) return pinned;
  const picks: OrModel[] = [];
  for (const family of FAMILIES[cap]) {
    const newest = models.filter((m) => family.test(m.id)).sort((a, b) => b.created - a.created)[0];
    if (newest) picks.push(newest);
  }
  if (picks.length === 0) return models.some((m) => m.id === fallback) ? fallback : models[0]?.id ?? fallback;
  picks.sort((a, b) => blendedPrice(a) - blendedPrice(b));
  return picks[0].id;
}

function orEntry(def: LlmTaskDef, m: OrModel, recommended: boolean, h: TaskHistory, stats?: EndpointStats | null): CatalogModel {
  const [promptTokens, completionTokens] = tokenCounts(def, h);
  const t = timingFor(h, m.id);
  // Logged cost on this very model beats a list-price projection.
  const projected = (promptTokens * m.promptPerM + completionTokens * m.completionPerM) / 1e6;
  // Time: a logged call on this model for this task, else OpenRouter's live endpoint
  // stats (first-token latency + the completion at the measured rate), else a guess.
  const estSeconds = t
    ? t.durationMsAvg / 1000
    : stats
      ? stats.latencyMs / 1000 + completionTokens / stats.tokensPerSec
      : fallbackSeconds(def, completionTokens);
  return {
    id: m.id,
    name: m.name,
    recommended,
    estCostUsd: t?.costUsdAvg ?? projected,
    estSeconds,
    basis: { taskCalls: h.tokens.calls, modelCalls: t?.calls ?? 0 },
    info: {
      promptPerM: m.promptPerM,
      completionPerM: m.completionPerM,
      ctx: m.ctx,
      created: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null,
      imageIn: m.imageIn,
      imageOut: m.imageOut,
      tools: m.tools,
    },
  };
}

const LIST_MAX = 60;

// The user's key, when they have one, unlocks OpenRouter's endpoint stats for the
// time estimates; it is used for that read and nothing else.
async function openRouterList(task: LlmTaskId, userId?: string): Promise<TaskModelList> {
  const def = taskDef(task);
  const cap = capabilityOf(def);
  const [all, h, pins] = await Promise.all([getOpenRouterCatalog(), historyFor(task, "openrouter"), getRecommendedModels()]);
  const fitting = all.filter((m) => fits(m, cap));
  const recommended = recommend(fitting, cap, def.openRouterModel, pins[task]?.openrouter);
  // By name; the recommendation is also the dropdown's default entry. Capped so the
  // list stays readable — a model outside the cut is still reachable by manual entry
  // (the cut keeps the cheapest, which is where the useful long tail is).
  const kept = fitting.length > LIST_MAX
    ? [...fitting].sort((a, b) => blendedPrice(a) - blendedPrice(b)).slice(0, LIST_MAX)
    : fitting;
  const rec = fitting.find((m) => m.id === recommended);
  if (rec && !kept.includes(rec)) kept.push(rec);
  kept.sort((a, b) => a.name.localeCompare(b.name));
  const stats = await statsWithUserKey(userId, kept.map((m) => m.id));
  return { recommended, models: kept.map((m) => orEntry(def, m, m.id === recommended, h, stats?.get(m.id))) };
}

async function statsWithUserKey(userId: string | undefined, ids: string[]): Promise<Map<string, EndpointStats | null> | null> {
  if (!userId || !(await getOpenRouterKeyStatus(userId)).configured) return null;
  try {
    return await withOpenRouterKey(userId, (key) => endpointStatsFor(ids, key));
  } catch {
    return null;
  }
}

async function validateOpenRouterModel(id: string, task: LlmTaskId, userId?: string): Promise<ValidationResult> {
  if (!/^[a-z0-9-]+\/[a-z0-9][a-z0-9.:-]*$/i.test(id)) return { ok: false, reason: "An OpenRouter model id looks like vendor/model-name" };
  const def = taskDef(task);
  const cap = capabilityOf(def);
  const all = await getOpenRouterCatalog();
  const model = all.find((m) => m.id === id);
  if (!model) return { ok: false, reason: "Not in OpenRouter's model list" };
  if (!fits(model, cap)) {
    const need = cap === "image" ? "generate images" : cap === "vision" ? "read images" : cap === "tools" ? "call tools" : "handle text";
    return { ok: false, reason: `${model.name} can't ${need}, which this task needs` };
  }
  const [h, stats] = await Promise.all([historyFor(task, "openrouter"), statsWithUserKey(userId, [model.id])]);
  return { ok: true, name: model.name, model: orEntry(def, model, false, h, stats?.get(model.id)) };
}

// The OpenRouter model a task runs on when the user left the choice blank — the same
// pick the dropdown shows as recommended, so what is shown is what runs. Falls back
// to the task's static default only if the catalog can't be fetched at all.
export async function recommendedOpenRouterModel(task: LlmTaskId): Promise<string> {
  const def = taskDef(task);
  try {
    const [all, pins] = await Promise.all([getOpenRouterCatalog(), getRecommendedModels()]);
    const cap = capabilityOf(def);
    return recommend(all.filter((m) => fits(m, cap)), cap, def.openRouterModel, pins[task]?.openrouter);
  } catch {
    return def.openRouterModel;
  }
}

// ---------------------------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------------------------

export async function listModels(backend: LlmBackend, task: LlmTaskId, userId?: string): Promise<TaskModelList> {
  return backend === "claude" ? claudeList(task) : openRouterList(task, userId);
}

// Every task's list for one backend in one call (what the settings page loads).
export async function listModelsForAllTasks(backend: LlmBackend, userId?: string): Promise<Record<string, TaskModelList>> {
  const out: Record<string, TaskModelList> = {};
  for (const def of LLM_TASKS) {
    if (backend === "claude" && def.openRouterOnly) continue;
    out[def.id] = await listModels(backend, def.id, userId);
  }
  return out;
}

export async function validateModel(backend: LlmBackend, task: LlmTaskId, id: string, userId?: string): Promise<ValidationResult> {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, reason: "Empty model id" };
  return backend === "claude" ? validateClaudeModel(trimmed, task) : validateOpenRouterModel(trimmed, task, userId);
}
