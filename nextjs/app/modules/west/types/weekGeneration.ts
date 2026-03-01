import { CreateProgramTargetSet } from './program';

export interface ExerciseEstimate {
  exerciseId: string;
  exerciseName: string;
  estimatedOneRepMax: number; // Epley: weight * (1 + reps / 30)
}

export interface NextWeekExerciseTargets {
  exerciseId: string;
  orderIndex: number;
  sets: CreateProgramTargetSet[];
}

export interface NextWeekSessionTargets {
  sessionId: string | null; // null = session needs to be created (next block)
  sessionName: string;
  orderIndex: number;
  sessionDate: string;
  exercises: NextWeekExerciseTargets[];
}

export interface NextWeekInfo {
  weekId: string;
  blockTag: string | null;
  weekIndexInBlock: number; // 0-indexed position within the block
  totalBlockWeeks: number;
  hasExistingSessions: boolean;
  existingSessions: any[];
}
