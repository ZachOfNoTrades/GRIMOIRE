// Types for day archetypes + slots (deterministic generation engine — plan §3/§5/§6).

export interface DayArchetype {
  id: string;
  program_id: string | null;
  program_name?: string | null; // joined in the list query (getDayArchetypes) so the UI can label/filter by program
  name: string;
  description: string | null;
  created_at: Date;
  modified_at: Date;
  slot_count?: number;        // populated by the list query (getDayArchetypes) for at-a-glance counts
  slot_sequence?: string | null; // ordered "role:is_warmup" tokens (comma-separated) — drives the collapsed-row composition strip
}

export interface DaySlot {
  id: string;
  day_archetype_id: string;
  order_index: number;
  role: string;
  target_muscle_group_id: string | null;
  target_muscle_name: string | null;
  category_filter: string;
  rotation_cadence: string;        // never | per_block | per_session
  pinned_exercise_id: string | null;
  pinned_exercise_name: string | null;
  is_optional: boolean;
  is_warmup: boolean;              // warmup-exercise slot: engine fills from is_warmup exercises, emitted before working slots
  progression_model: string;       // double_progression | linear | rpe_pct1rm | time_effort
  rep_low: number;                 // rep range (rep-based models)
  rep_high: number;
  time_low_seconds: number | null; // duration range in seconds (time_effort model only)
  time_high_seconds: number | null;
  target_rpe: number | null;
  load_step_pct: number;
  round_to_step: number;
  set_target: number;
}

export interface DayArchetypeWithSlots extends DayArchetype {
  slots: DaySlot[];
}

// Editable slot fields (create/update payload).
export interface DaySlotInput {
  order_index: number;
  role: string;
  target_muscle_group_id: string | null;
  category_filter: string;
  rotation_cadence: string;
  pinned_exercise_id: string | null;
  is_optional: boolean;
  is_warmup: boolean;
  progression_model: string;
  rep_low: number;
  rep_high: number;
  time_low_seconds: number | null;
  time_high_seconds: number | null;
  target_rpe: number | null;
  load_step_pct: number;
  round_to_step: number;
  set_target: number;
}
