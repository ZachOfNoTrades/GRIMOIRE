import { LLM_TASK_GROUPS, type LlmTaskGroup } from "@/lib/llm/tasks";

// Read the Usage chart's module filter from a ?modules= value, such as "forage" or "rune,golem"
// NOTE: An unknown name is skipped, and a value with no known name gives an empty list, which shows every module
export function parseChartModules(value: string | string[] | undefined): LlmTaskGroup[] {
  const text = Array.isArray(value) ? value.join(",") : value ?? "";
  const names = new Set(text.split(",").map((name) => name.trim().toLowerCase()));
  return LLM_TASK_GROUPS.map((g) => g.key).filter((key) => names.has(key));
}

// Build the Usage page's address with the chart filtered to one module
export function usageHref(module: LlmTaskGroup): string {
  return `/settings/ui/usage?modules=${module}`;
}
