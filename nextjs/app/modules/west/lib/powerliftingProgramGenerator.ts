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

// =============================
// Input Types
// =============================

export interface PowerliftingGeneratorInput {
  squatExerciseId: string;
  benchExerciseId: string;
  deadliftExerciseId: string;
  squat1RM: number;
  bench1RM: number;
  deadlift1RM: number;
  totalWeeks: number;
  daysPerWeek: number;      // 3-6
}

// =============================
// Session Template Generation
// =============================

interface ExerciseInput {
  exerciseId: string;
  oneRepMax: number;
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
// Utility Functions
// =============================

// Round weight to nearest 5 lbs
export function round5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

// =============================
// Block Week Calculation
// =============================

export function calculateBlockSplit(totalWeeks: number): { hypertrophyWeeks: number; strengthWeeks: number; peakingWeeks: number } {
  if (totalWeeks < 1) {
    return { hypertrophyWeeks: 0, strengthWeeks: 0, peakingWeeks: 0 };
  }

  // Short programs (1-3 weeks): peaking only
  if (totalWeeks <= 3) {
    return { hypertrophyWeeks: 0, strengthWeeks: 0, peakingWeeks: totalWeeks };
  }

  // Medium-short programs (4-7 weeks): strength + peaking
  if (totalWeeks <= 7) {
    const peakingWeeks = Math.max(2, Math.round(totalWeeks * 0.40));
    const strengthWeeks = totalWeeks - peakingWeeks;
    return { hypertrophyWeeks: 0, strengthWeeks, peakingWeeks };
  }

  // Standard programs (8+ weeks): hypertrophy + strength + peaking
  let hypertrophyWeeks = Math.round(totalWeeks * 0.50);
  let strengthWeeks = Math.round(totalWeeks * 0.30);
  let peakingWeeks = totalWeeks - hypertrophyWeeks - strengthWeeks;

  // Enforce minimums: hyp >= 4, str >= 2, peak >= 2
  const minimums = [
    { key: 'hyp', min: 4, get: () => hypertrophyWeeks, set: (v: number) => { hypertrophyWeeks = v; } },
    { key: 'str', min: 2, get: () => strengthWeeks, set: (v: number) => { strengthWeeks = v; } },
    { key: 'peak', min: 2, get: () => peakingWeeks, set: (v: number) => { peakingWeeks = v; } },
  ];

  // If any block is below its minimum, steal from the largest block
  for (const entry of minimums) {
    while (entry.get() < entry.min) {
      const largest = minimums
        .filter(m => m.key !== entry.key && m.get() > m.min)
        .sort((a, b) => b.get() - a.get())[0];

      if (!largest) break; // Cannot satisfy minimums
      largest.set(largest.get() - 1);
      entry.set(entry.get() + 1);
    }
  }

  return { hypertrophyWeeks, strengthWeeks, peakingWeeks };
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

export function generatePowerliftingProgram(input: PowerliftingGeneratorInput, llmGenerated: boolean): CreateProgramPayload {
  const totalWeeks = input.totalWeeks;

  if (totalWeeks < 1) {
    throw new Error(`Total weeks must be at least 1. Received: ${totalWeeks}.`);
  }

  const { hypertrophyWeeks, strengthWeeks, peakingWeeks } = calculateBlockSplit(totalWeeks);

  // Exercise inputs in rotation order
  const exercises: ExerciseInput[] = [
    { exerciseId: input.squatExerciseId, oneRepMax: input.squat1RM, label: 'Squat' },
    { exerciseId: input.benchExerciseId, oneRepMax: input.bench1RM, label: 'Bench' },
    { exerciseId: input.deadliftExerciseId, oneRepMax: input.deadlift1RM, label: 'Deadlift' },
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
          const workingWeight = round5(exercise.oneRepMax * weekParams.intensity);

          const warmupSets = generateWarmupSets(workingWeight);
          const workingSets = generateWorkingSets(weekParams.reps, workingWeight, weekParams.rpe, weekParams.workingSets);

          sessions.push({
            order_index: sessionIndex + 1,
            name: template.name,
            target_exercises: [{
              exercise_id: exercise.exerciseId,
              order_index: 1,
              sets: [...warmupSets, ...workingSets],
            }],
          });
        }
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
    description: `${input.daysPerWeek} days/week | S/B/D: ${input.squat1RM}/${input.bench1RM}/${input.deadlift1RM}`,
    blocks,
  };
}
