import type { UsageBackend } from "./types";

// Keep a call's cost only for OpenRouter, as the shared Claude CLI and local engines have no per-call cost
export function trackedCostUsd(backend: UsageBackend, costUsd: number | null): number | null {
  return backend === "openrouter" ? costUsd : null;
}

// Add a cost to a total, keeping null while neither has a tracked cost
export function addCost(totalUsd: number | null, costUsd: number | null): number | null {
  if (costUsd === null) return totalUsd;
  return (totalUsd ?? 0) + costUsd;
}

// Format a tracked cost as $1.23 or $0.0012, or a dash when the calls have no tracked cost
export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return "—";
  return costUsd >= 1 ? `$${costUsd.toFixed(2)}` : `$${costUsd.toFixed(4)}`;
}

// Format a module's share of the total tracked cost, such as 14% or <1%, or a dash when either has no tracked cost
export function formatCostShare(costUsd: number | null, totalUsd: number | null): string {
  if (costUsd === null || totalUsd === null || totalUsd <= 0) return "—";
  if (costUsd <= 0) return "0%";
  const percent = (costUsd / totalUsd) * 100;
  return percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}
