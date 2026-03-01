export function getStatusLabel(isCurrent: boolean, isCompleted: boolean, startedAt?: Date | null): string {
  if (isCompleted) return "Complete";
  if (startedAt) return "In Progress";
  if (isCurrent) return "Current";
  return "Not Started";
}

export function getStatusBadge(isCurrent: boolean, isCompleted: boolean, startedAt?: Date | null): string {
  if (isCompleted) return "badge-success";
  if (startedAt) return "badge-warning";
  if (isCurrent) return "badge-default";
  return "badge-muted";
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface ProgramSession {
  id: string;
  name: string;
  notes: string | null;
  order_index: number | null;
  started_at: Date | null;
  resumed_at: Date | null;
  duration: number | null;
  is_current: boolean;
  is_completed: boolean;
}

export interface ProgramWeek {
  id: string;
  week_number: number;
  name: string | null;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  volume: number; // total working set volume (reps * weight) for the week
  has_targets: boolean; // whether target exercises have been assigned to the week's sessions
  sessions: ProgramSession[];
}

export interface ProgramBlock {
  id: string;
  name: string;
  order_index: number;
  description: string | null;
  tag: string | null;
  color: string | null;
  is_current: boolean;
  is_completed: boolean;
  weeks: ProgramWeek[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
  blocks: ProgramBlock[];
}

// =============================
// Powerlifting Phase Types
// =============================

export interface BlockPhase {
  name: string;
  tag: string;
  color: string;
  intensityMin: number;     // % of 1RM
  intensityMax: number;
  repMin: number;
  repMax: number;
  workingSets: number;      // per competition lift
  baseRPE: number;
  accessorySets: number;
  accessoryReps: number;
}

export interface WeekParams {
  intensity: number;
  reps: number;
  rpe: number;
  workingSets: number;
  accessorySets: number;
  isDeload: boolean;
}

export const HYPERTROPHY: BlockPhase = {
  name: 'Hypertrophy',
  tag: 'Hypertrophy',
  color: '#3B82F6',
  intensityMin: 0.60,
  intensityMax: 0.75,
  repMin: 4,
  repMax: 6,
  workingSets: 4,
  baseRPE: 7,
  accessorySets: 3,
  accessoryReps: 10,
};

export const STRENGTH: BlockPhase = {
  name: 'Strength',
  tag: 'Strength',
  color: '#F59E0B',
  intensityMin: 0.75,
  intensityMax: 0.87,
  repMin: 2,
  repMax: 4,
  workingSets: 4,
  baseRPE: 8,
  accessorySets: 3,
  accessoryReps: 6,
};

export const PEAKING: BlockPhase = {
  name: 'Peaking',
  tag: 'Peaking',
  color: '#EF4444',
  intensityMin: 0.87,
  intensityMax: 0.95,
  repMin: 1,
  repMax: 2,
  workingSets: 3,
  baseRPE: 9,
  accessorySets: 2,
  accessoryReps: 5,
};

// Tag string → BlockPhase lookup for phase detection during week generation
export const BLOCK_PHASES: Record<string, BlockPhase> = {
  Hypertrophy: HYPERTROPHY,
  Strength: STRENGTH,
  Peaking: PEAKING,
};

// =============================
// Create Payload Types
// =============================

export interface CreateProgramTargetSet {
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
}

export interface CreateProgramTargetExercise {
  exercise_id: string;
  order_index: number;
  sets: CreateProgramTargetSet[];
}

export interface CreateProgramSession {
  order_index: number;
  name: string;
  target_exercises: CreateProgramTargetExercise[];
}

export interface CreateProgramWeek {
  week_number: number;
  name: string | null;
  description: string | null;
  sessions: CreateProgramSession[];
}

export interface CreateProgramBlock {
  name: string;
  order_index: number;
  description: string | null;
  tag: string | null;
  color: string | null;
  weeks: CreateProgramWeek[];
}

export interface CreateProgramPayload {
  name: string;
  description: string | null;
  blocks: CreateProgramBlock[];
}
