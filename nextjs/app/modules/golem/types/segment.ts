export interface TargetSegment {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  modifier_id: string | null;
  modifier_name: string | null;
  order_index: number;
  is_warmup: boolean;
  created_at: Date;
  modified_at: Date;
  sets: TargetSegmentSet[];
}

export interface TargetSegmentSet {
  id: string;
  target_session_segment_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
  created_at: Date;
  modified_at: Date;
}

export interface Segment {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
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
  reps: number;
  weight: number;
  rpe: number | null;
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
  sets: {
    set_number: number;
    is_warmup: boolean;
    reps: number;
    weight: number;
    rpe: number | null;
  }[];
}
