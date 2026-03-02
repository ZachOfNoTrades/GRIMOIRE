import {
  BlockPhase,
  WeekParams,
  HYPERTROPHY,
  STRENGTH,
  PEAKING,
  CreateProgramPayload,
  CreateProgramBlock,
  CreateProgramWeek,
  CreateProgramSession,
  CreateProgramTargetExercise,
  CreateProgramTargetSet,
} from '../types/program';
import { getAllExercisesWithMuscleGroups } from './exerciseFunctions';
import { generateFirstWeekPlanWithLlm } from './llmWeekGenerationFunctions';
import { calculateBlockSplit, round5 } from '../utils/calc';

// =============================
// Input Types
// =============================

export interface PowerliftingGeneratorInput {
  squatExerciseId: string;
  benchExerciseId: string;
  deadliftExerciseId: string;
  totalWeeks: number;
  daysPerWeek: number;      // 3-6
}

// =============================
// Session Template Generation
// =============================

interface ExerciseInput {
  exerciseId: string;
  oneRepMax: number | null;
  label: string;
}

interface SessionTemplate {
  name: string;
  exerciseIndex: number;
}

// Build session templates by cycling through exercises round-robin
function buildSessionTemplates(daysPerWeek: number, exercises: ExerciseInput[]): SessionTemplate[] {
  const templates: SessionTemplate[] = [];

  for (let i = 0; i < daysPerWeek; i++) {
    const exerciseIndex = i % exercises.length;
    const dayNumber = Math.floor(i / exercises.length) + 1;
    const suffix = dayNumber > 1 ? ` ${dayNumber}` : '';

    templates.push({
      name: `${exercises[exerciseIndex].label} Day${suffix}`,
      exerciseIndex,
    });
  }

  return templates;
}


// =============================
// Set Generation
// =============================

// Generate warmup sets ramping from 50% to 80% of working weight
export function generateWarmupSets(workingWeight: number): CreateProgramTargetSet[] {
  const warmupPercentages = [0.50, 0.60, 0.70, 0.80];
  const warmupReps = [5, 4, 3, 2];
  const sets: CreateProgramTargetSet[] = [];

  for (let i = 0; i < warmupPercentages.length; i++) {
    const weight = round5(workingWeight * warmupPercentages[i]);
    if (weight < 45) continue; // Skip if below empty bar
    if (sets.length > 0 && sets[sets.length - 1].weight === weight) continue; // Skip duplicates

    sets.push({
      set_number: sets.length + 1,
      is_warmup: true,
      reps: warmupReps[i],
      weight,
      rpe: null,
    });
  }

  return sets;
}

// Generate working sets for a segment
export function generateWorkingSets(reps: number, weight: number, rpe: number, setCount: number): CreateProgramTargetSet[] {
  const sets: CreateProgramTargetSet[] = [];
  for (let i = 0; i < setCount; i++) {
    sets.push({
      set_number: i + 1,
      is_warmup: false,
      reps,
      weight,
      rpe,
    });
  }
  return sets;
}

// Generate accessory sets (weight = 0, user fills in)
export function generateAccessorySets(reps: number, rpe: number, setCount: number): CreateProgramTargetSet[] {
  const sets: CreateProgramTargetSet[] = [];
  for (let i = 0; i < setCount; i++) {
    sets.push({
      set_number: i + 1,
      is_warmup: false,
      reps,
      weight: 0,
      rpe,
    });
  }
  return sets;
}

// =============================
// Week Progression Calculations
// =============================

export function calculateWeekParams(phase: BlockPhase, weekIndex: number, totalBlockWeeks: number): WeekParams {
  const isDeload = weekIndex > 0 && weekIndex % 4 === 3; // Every 4th week (0-indexed: 3, 7, 11...)

  // Linear intensity progression across the block
  const weekProgress = totalBlockWeeks > 1 ? weekIndex / (totalBlockWeeks - 1) : 0;
  let intensity = phase.intensityMin + weekProgress * (phase.intensityMax - phase.intensityMin);

  // Reps decrease as intensity increases
  let reps = phase.repMax - Math.round(weekProgress * (phase.repMax - phase.repMin));

  // RPE increases 0.5 per week
  let rpe = phase.baseRPE + (weekIndex * 0.5);

  // Working and accessory set counts
  let workingSets = phase.workingSets;
  let accessorySets = phase.accessorySets;

  // Deload adjustments
  if (isDeload) {
    intensity *= 0.85;
    reps = phase.repMax;
    rpe = phase.baseRPE - 1;
    workingSets = Math.max(2, Math.round(phase.workingSets * 0.6));
    accessorySets = Math.max(1, Math.round(phase.accessorySets * 0.6));
  }

  // Cap RPE at 10
  rpe = Math.min(rpe, 10);

  return { intensity, reps, rpe, workingSets, accessorySets, isDeload };
}

// =============================
// Main Generator
// =============================

export async function generatePowerliftingProgram(
  input: PowerliftingGeneratorInput,
  llmGenerated: boolean,
): Promise<CreateProgramPayload> {
  const totalWeeks = input.totalWeeks;

  if (totalWeeks < 1) {
    throw new Error(`Total weeks must be at least 1. Received: ${totalWeeks}.`);
  }

  const { hypertrophyWeeks, strengthWeeks, peakingWeeks } = calculateBlockSplit(totalWeeks);

  // Fetch exercise list with e1RM data
  const allExercises = await getAllExercisesWithMuscleGroups();
  const exerciseLookup = new Map(allExercises.map(e => [e.id, e]));

  // Exercise inputs in rotation order
  const exercises: ExerciseInput[] = [
    { exerciseId: input.squatExerciseId, oneRepMax: exerciseLookup.get(input.squatExerciseId)?.estimated_one_rep_max ?? null, label: 'Squat' },
    { exerciseId: input.benchExerciseId, oneRepMax: exerciseLookup.get(input.benchExerciseId)?.estimated_one_rep_max ?? null, label: 'Bench' },
    { exerciseId: input.deadliftExerciseId, oneRepMax: exerciseLookup.get(input.deadliftExerciseId)?.estimated_one_rep_max ?? null, label: 'Deadlift' },
  ];
  const templates = buildSessionTemplates(input.daysPerWeek, exercises);

  // Build blocks — only include phases with > 0 weeks
  const blockConfigs: { phase: BlockPhase; weekCount: number }[] = [
    { phase: HYPERTROPHY, weekCount: hypertrophyWeeks },
    { phase: STRENGTH, weekCount: strengthWeeks },
    { phase: PEAKING, weekCount: peakingWeeks },
  ].filter(config => config.weekCount > 0);

  const blocks: CreateProgramBlock[] = [];

  for (let blockIndex = 0; blockIndex < blockConfigs.length; blockIndex++) {
    const { phase, weekCount } = blockConfigs[blockIndex];
    const weeks: CreateProgramWeek[] = [];

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
      const weekParams = calculateWeekParams(phase, weekIndex, weekCount);
      const isFirstWeek = blockIndex === 0 && weekIndex === 0;
      const weekName = weekParams.isDeload ? 'Deload' : null;
      const sessions: CreateProgramSession[] = [];

      // Generate first week sessions via template for non-LLM-generated program
      if (isFirstWeek && !llmGenerated) {
        for (let sessionIndex = 0; sessionIndex < templates.length; sessionIndex++) {
          const template = templates[sessionIndex];
          const exercise = exercises[template.exerciseIndex];
          const workingWeight = exercise.oneRepMax ? round5(exercise.oneRepMax * weekParams.intensity) : 0;

          const targetSets = workingWeight > 0
            ? [...generateWarmupSets(workingWeight), ...generateWorkingSets(weekParams.reps, workingWeight, weekParams.rpe, weekParams.workingSets)]
            : generateAccessorySets(weekParams.reps, weekParams.rpe, weekParams.workingSets);

          sessions.push({
            order_index: sessionIndex + 1,
            name: template.name,
            target_exercises: [{
              exercise_id: exercise.exerciseId,
              order_index: 1,
              sets: targetSets,
            }],
          });
        }
      }

      // Generate first week sessions via LLM
      if (isFirstWeek && llmGenerated) {
        const llmSessions = await generateFirstWeekPlanWithLlm(input, allExercises);
        sessions.push(...llmSessions);
      }

      weeks.push({
        week_number: weekIndex + 1,
        name: weekName,
        description: null,
        sessions,
      });
    }

    blocks.push({
      name: phase.name,
      order_index: blockIndex + 1,
      description: null,
      tag: phase.tag,
      color: phase.color,
      weeks,
    });
  }

  return {
    name: `Powerlifting Meet Prep — ${totalWeeks}wk`,
    description: `${input.daysPerWeek} days/week | S/B/D e1RM: ${exercises[0].oneRepMax ?? '—'}/${exercises[1].oneRepMax ?? '—'}/${exercises[2].oneRepMax ?? '—'}`,
    blocks,
  };
}
