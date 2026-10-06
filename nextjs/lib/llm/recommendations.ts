import { getAppSetting, setAppSetting } from "@/lib/appSettings";
import { isLlmTaskId, type LlmTaskId } from "./tasks";
import { isLlmBackend, type LlmBackend } from "./types";

// ADMIN-SET RECOMMENDATIONS — a global admin can pin the recommended model for a
// task on either backend (Settings → Admin → Recommended models). A pinned model
// takes the place of the catalog's own pick in the dropdown's default entry and
// at run time for users who left the choice blank. Tasks without a pin keep the
// catalog rule (newest release of a proven family, cheapest). Stored as one JSON
// app setting: { [task]: { openrouter?: id, claude?: alias } }.

export const RECOMMENDATIONS_KEY = "llm_recommended_models";

export type RecommendedModels = Partial<Record<LlmTaskId, Partial<Record<LlmBackend, string>>>>;

export function coerceRecommendedModels(value: unknown): RecommendedModels {
  const out: RecommendedModels = {};
  if (!value || typeof value !== "object") return out;
  for (const [task, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isLlmTaskId(task) || !raw || typeof raw !== "object") continue;
    const entry: Partial<Record<LlmBackend, string>> = {};
    for (const [backend, model] of Object.entries(raw as Record<string, unknown>)) {
      if (isLlmBackend(backend) && typeof model === "string" && model.trim()) entry[backend] = model.trim().slice(0, 120);
    }
    if (Object.keys(entry).length) out[task] = entry;
  }
  return out;
}

export async function getRecommendedModels(): Promise<RecommendedModels> {
  return coerceRecommendedModels(await getAppSetting(RECOMMENDATIONS_KEY));
}

export async function setRecommendedModels(value: RecommendedModels): Promise<RecommendedModels> {
  const clean = coerceRecommendedModels(value);
  await setAppSetting(RECOMMENDATIONS_KEY, clean);
  return clean;
}
