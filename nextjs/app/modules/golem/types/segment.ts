export interface TargetSegment {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_category: string;
  exercise_is_timed: boolean;
  exercise_distance_type: string | null; // NULL = no distance tracking, 'short' | 'long'
  modifier_id: string | null;
  modifier_name: string | null;
  order_index: number;
  is_warmup: boolean;
  slot_role: string | null; // day-archetype slot role that produced this target (engine-generated only)
  progression_model: string | null; // progression model of the originating slot
  day_archetype_id: string | null;  // archetype this target was generated from (provenance link)
  created_at: Date;
  modified_at: Date;
  sets: TargetSegmentSet[];
}

export interface TargetSegmentSet {
  id: string;
  target_session_segment_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number | null;
  weight: number;
  rpe: number | null;
  time_seconds: number | null;
  distance: number | null; // prescribed distance in meters (null unless the exercise tracks distance)
  created_at: Date;
  modified_at: Date;
  // Client-only: when a logged set's weight diverges from this prescribed weight, the divergent value is
  // carried onto the following sets here so their placeholder shows "new (old)". Never persisted.
  carried_weight?: number | null;
}

export interface Segment {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_category: string;
  exercise_is_timed: boolean;
  exercise_distance_type: string | null; // NULL = no distance tracking, 'short' | 'long'
  target_id: string | null;
  modifier_id: string | null;
  modifier_name: string | null;
  order_index: number;
  is_warmup: boolean;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface SegmentSet {
  id: string;
  session_segment_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number | null;
  weight: number;
  rpe: number | null;
  time_seconds: number | null;
  distance: number | null; // logged distance in meters (null unless the exercise tracks distance)
  notes: string | null;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface SegmentWithSets extends Segment {
  sets: SegmentSet[];
  target: TargetSegment | null;
}

export interface GeneratedSegment {
  exercise_id: string;
  modifier_id: string | null;
  order_index: number;
  is_warmup: boolean;
  slot_role?: string | null; // set by the deterministic engine; omitted by LLM/manual targets
  progression_model?: string | null; // progression model of the originating slot (engine-generated only)
  day_archetype_id?: string | null;  // archetype this target was generated from (provenance link)
  sets: {
    set_number: number;
    is_warmup: boolean;
    reps: number | null;
    weight: number;
    rpe: number | null;
    time_seconds: number | null;
  }[];
}

// An exercise the LLM suggests creating when the existing library lacks suitable options
export interface SuggestedExercise {
  name: string;
  description: string | null;
  category: string;
  is_timed: boolean;
  modifier_id: string | null;
  order_index: number;
  is_warmup: boolean;
  sets: GeneratedSegment['sets'];
}

// Result from generateSessionTargetsWithLlm
export interface GenerationResult {
  targets: GeneratedSegment[];
  suggestions: SuggestedExercise[];
}
