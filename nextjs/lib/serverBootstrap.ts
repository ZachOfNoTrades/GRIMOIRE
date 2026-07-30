// Run-once bootstrap for in-process background work. Imported by the root server
// layout (Node runtime only) so it runs on first render but never reaches the
// Edge/middleware bundle the way `instrumentation.ts` would.
//
// Both schedulers are idempotent via a process-global flag, so re-imports during
// HMR or per-request module evaluation are safe.

import { startQuestDigestScheduler } from "@/app/modules/quest/lib/digestScheduler";
import { startRuneDigestScheduler } from "@/app/modules/rune/lib/digestScheduler";
import { startForageCheckinScheduler } from "@/app/modules/forage/lib/checkinScheduler";

let bootstrapped = false;

export function bootstrapBackgroundWork(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  startQuestDigestScheduler();
  startRuneDigestScheduler();
  startForageCheckinScheduler();
}

// Auto-run on import. The root layout is the canonical entry point and only
// executes in the Node runtime, so this is safe.
bootstrapBackgroundWork();
