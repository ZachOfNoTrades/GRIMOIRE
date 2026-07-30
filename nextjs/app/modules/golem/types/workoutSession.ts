import { DaySlot } from "./dayArchetype";

export interface WorkoutSession {
  id: string;
  week_id: string | null;
  order_index: number | null;
  name: string;
  description: string | null;
  day_archetype_id: string | null; // engine generation lineage; null for non-engine sessions
  day_archetype_name: string | null; // joined for immediate display in the engine picker (no extra round trip)
  day_archetype_slots?: DaySlot[]; // bundled with the session so the empty-session slot preview renders without a follow-up fetch
  review: string | null;
  analysis: string | null;
  pre_survey_notes: string | null;
  started_at: Date | null;
  resumed_at: Date | null;
  duration: number | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}

// A workout session row enriched with its program context for the unified history feed.
// Program fields are null for standalone (ad-hoc) sessions where week_id IS NULL.
export interface WorkoutSessionHistoryItem extends WorkoutSession {
  program_id: string | null;
  program_name: string | null;
  block_name: string | null;
  week_number: number | null;
}
