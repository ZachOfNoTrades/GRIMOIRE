import { LLM_TASKS, taskDef, type LlmTaskDef, type LlmTaskId } from "./tasks";
import type { LlmBackend } from "./types";

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

export interface CatalogModel {
  id: string;
  name: string;
  // Short price/context line for the dropdown ("$0.10 / $0.30 per M · 262K ctx").
  note: string;
  recommended: boolean;
}

export interface TaskModelList {
  recommended: string;
  models: CatalogModel[];
}

export interface ValidationResult {
  ok: boolean;
  name?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------------------------
// CLAUDE CLI
// ---------------------------------------------------------------------------------------------

const CLAUDE_MODELS: { id: string; name: string; note: string }[] = [
  { id: "haiku", name: "Haiku", note: "" },
  { id: "sonnet", name: "Sonnet", note: "" },
  { id: "opus", name: "Opus", note: "" },
];
const CLAUDE_ALIASES = new Set(CLAUDE_MODELS.map((m) => m.id));
// Full ids the CLI accepts ("claude-sonnet-4-6", "claude-opus-5-5[1m]").
const CLAUDE_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{2,60}(\[1m\])?$/;

export function claudeRecommendation(task: LlmTaskId): string {
  return taskDef(task).cliModel ?? "sonnet";
}

function claudeList(task: LlmTaskId): TaskModelList {
  const recommended = claudeRecommendation(task);
  return {
    recommended,
    models: CLAUDE_MODELS.map((m) => ({ ...m, recommended: m.id === recommended })),
  };
}

function validateClaudeModel(id: string): ValidationResult {
  if (CLAUDE_ALIASES.has(id)) return { ok: true, name: CLAUDE_MODELS.find((m) => m.id === id)!.name };
  if (CLAUDE_ID_PATTERN.test(id)) return { ok: true, name: id };
  return { ok: false, reason: "Use haiku, sonnet, opus, or a full Claude model id like claude-sonnet-4-6" };
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

function recommend(models: OrModel[], cap: Capability, fallback: string): string {
  const picks: OrModel[] = [];
  for (const family of FAMILIES[cap]) {
    const newest = models.filter((m) => family.test(m.id)).sort((a, b) => b.created - a.created)[0];
    if (newest) picks.push(newest);
  }
  if (picks.length === 0) return models.some((m) => m.id === fallback) ? fallback : models[0]?.id ?? fallback;
  picks.sort((a, b) => blendedPrice(a) - blendedPrice(b));
  return picks[0].id;
}

function money(perM: number): string {
  return perM >= 1 ? `$${perM.toFixed(2)}` : `$${perM.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function ctxLabel(ctx: number): string {
  return ctx >= 1_000_000 ? `${(ctx / 1_000_000).toFixed(1)}M ctx` : `${Math.round(ctx / 1000)}K ctx`;
}

function noteFor(m: OrModel, cap: Capability): string {
  if (cap === "image") return `${money(m.completionPerM)} per M out`;
  return `${money(m.promptPerM)} / ${money(m.completionPerM)} per M · ${ctxLabel(m.ctx)}`;
}

const LIST_MAX = 40;

async function openRouterList(task: LlmTaskId): Promise<TaskModelList> {
  const def = taskDef(task);
  const cap = capabilityOf(def);
  const all = await getOpenRouterCatalog();
  const fitting = all.filter((m) => fits(m, cap));
  const recommended = recommend(fitting, cap, def.openRouterModel);
  // Cheapest first, the recommendation pinned to the top, capped so the dropdown
  // stays readable; a model outside the cut is still reachable by manual entry.
  const sorted = fitting.sort((a, b) => blendedPrice(a) - blendedPrice(b));
  const top = sorted.filter((m) => m.id !== recommended).slice(0, LIST_MAX - 1);
  const rec = fitting.find((m) => m.id === recommended);
  const models = [...(rec ? [rec] : []), ...top].map((m) => ({ id: m.id, name: m.name, note: noteFor(m, cap), recommended: m.id === recommended }));
  return { recommended, models };
}

async function validateOpenRouterModel(id: string, task: LlmTaskId): Promise<ValidationResult> {
  if (!/^[a-z0-9-]+\/[a-z0-9][a-z0-9.:-]*$/i.test(id)) return { ok: false, reason: "An OpenRouter model id looks like vendor/model-name" };
  const cap = capabilityOf(taskDef(task));
  const all = await getOpenRouterCatalog();
  const model = all.find((m) => m.id === id);
  if (!model) return { ok: false, reason: "Not in OpenRouter's model list" };
  if (!fits(model, cap)) {
    const need = cap === "image" ? "generate images" : cap === "vision" ? "read images" : cap === "tools" ? "call tools" : "handle text";
    return { ok: false, reason: `${model.name} can't ${need}, which this task needs` };
  }
  return { ok: true, name: model.name };
}

// ---------------------------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------------------------

export async function listModels(backend: LlmBackend, task: LlmTaskId): Promise<TaskModelList> {
  return backend === "claude" ? claudeList(task) : openRouterList(task);
}

// Every task's list for one backend in one call (what the settings page loads).
export async function listModelsForAllTasks(backend: LlmBackend): Promise<Record<string, TaskModelList>> {
  const out: Record<string, TaskModelList> = {};
  for (const def of LLM_TASKS) {
    if (backend === "claude" && def.openRouterOnly) continue;
    out[def.id] = await listModels(backend, def.id);
  }
  return out;
}

export async function validateModel(backend: LlmBackend, task: LlmTaskId, id: string): Promise<ValidationResult> {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, reason: "Empty model id" };
  return backend === "claude" ? validateClaudeModel(trimmed) : validateOpenRouterModel(trimmed, task);
}
