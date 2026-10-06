import type { LlmBackend, LlmTaskConfig } from "./types";

// TASK REGISTRY — one entry per kind of model call. The settings page lists these,
// user_preferences.llm_tasks stores the per-task choice, and the usage log is keyed
// by task id. Defaults reproduce what each call site did before the layer existed.

export type LlmTaskId =
  | "rune_eval"
  | "rune_refine"
  | "rune_deck"
  | "golem_program"
  | "golem_week"
  | "golem_session"
  | "golem_analysis"
  | "golem_regenerate"
  | "forage_estimate"
  | "forage_label_image"
  | "forage_recipe_photo"
  | "oracle_world"
  | "oracle_build"
  | "oracle_map"
  | "oracle_chips"
  | "oracle_fact"
  | "oracle_outline"
  | "oracle_picture"
  | "oracle_image";

export type LlmTaskGroup = "rune" | "golem" | "forage" | "oracle";

export interface LlmTaskDef {
  id: LlmTaskId;
  group: LlmTaskGroup;
  label: string;
  // OpenRouter model used when the user hasn't picked one.
  openRouterModel: string;
  // CLI alias used by the claude backend; undefined = the CLI's own default.
  cliModel?: string;
  cliEffort?: string;
  needsVision?: boolean;
  needsTools?: boolean;
  // Tasks with no CLI equivalent (image generation) are OpenRouter-only.
  openRouterOnly?: boolean;
}

// Fast, cheap text model: 0.8 s / $0.00006 on the rune eval prompt when measured
// (2026-10-05), grading identically to Sonnet.
const FAST_TEXT = "qwen/qwen3-30b-a3b-instruct-2507";
// Function calling + long structured JSON (program/deck generation).
const TOOLS = "anthropic/claude-haiku-4.5";
// Reads label / recipe photos.
const VISION = "google/gemini-2.5-flash";

export const LLM_TASKS: readonly LlmTaskDef[] = [
  { id: "rune_eval",          group: "rune",   label: "Spoken answer grading", openRouterModel: FAST_TEXT, cliModel: "sonnet", cliEffort: "low" },
  { id: "rune_refine",        group: "rune",   label: "Card refine",           openRouterModel: FAST_TEXT },
  { id: "rune_deck",          group: "rune",   label: "Deck generate / refine", openRouterModel: TOOLS, needsTools: true },
  { id: "golem_program",      group: "golem",  label: "Program generation",    openRouterModel: TOOLS, needsTools: true },
  { id: "golem_week",         group: "golem",  label: "Week plan",             openRouterModel: TOOLS, needsTools: true },
  { id: "golem_session",      group: "golem",  label: "Session targets",       openRouterModel: TOOLS, needsTools: true },
  { id: "golem_analysis",     group: "golem",  label: "Session analysis",      openRouterModel: TOOLS, needsTools: true },
  { id: "golem_regenerate",   group: "golem",  label: "Session plan rewrite",  openRouterModel: TOOLS, needsTools: true },
  { id: "forage_estimate",    group: "forage", label: "Food estimates",        openRouterModel: FAST_TEXT },
  { id: "forage_label_image", group: "forage", label: "Label photo",           openRouterModel: VISION, needsVision: true },
  { id: "forage_recipe_photo", group: "forage", label: "Recipe photo",         openRouterModel: VISION, needsVision: true },
  { id: "oracle_world",       group: "oracle", label: "World",                 openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_build",       group: "oracle", label: "Session build",         openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_map",         group: "oracle", label: "Map",                   openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_chips",       group: "oracle", label: "Idea chips",            openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_fact",        group: "oracle", label: "Knowledge facts",       openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_outline",     group: "oracle", label: "Entity outline",        openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_picture",     group: "oracle", label: "Picture search terms",  openRouterModel: FAST_TEXT, cliModel: "haiku" },
  { id: "oracle_image",       group: "oracle", label: "Image generation",      openRouterModel: "google/gemini-3.1-flash-image", openRouterOnly: true },
];

export const LLM_TASK_IDS: readonly LlmTaskId[] = LLM_TASKS.map((t) => t.id);

export const LLM_TASK_GROUPS: { key: LlmTaskGroup; label: string }[] = [
  { key: "rune", label: "Rune" },
  { key: "golem", label: "Golem" },
  { key: "forage", label: "Forage" },
  { key: "oracle", label: "Oracle" },
];

const BY_ID: Record<string, LlmTaskDef> = Object.fromEntries(LLM_TASKS.map((t) => [t.id, t]));

export function isLlmTaskId(value: unknown): value is LlmTaskId {
  return typeof value === "string" && value in BY_ID;
}

export function taskDef(id: LlmTaskId): LlmTaskDef {
  return BY_ID[id];
}

export function defaultTaskConfig(id: LlmTaskId): LlmTaskConfig {
  const backend: LlmBackend = BY_ID[id].openRouterOnly ? "openrouter" : "claude";
  return { backend };
}
