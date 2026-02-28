import {
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
  meetDate: string;         // YYYY-MM-DD
  daysPerWeek: number;      // 3-6
  exerciseCatalog: { id: string; name: string }[];
}

// =============================
// Block Phase Constants
// =============================

interface BlockPhase {
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

const HYPERTROPHY: BlockPhase = {
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

const STRENGTH: BlockPhase = {
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

const PEAKING: BlockPhase = {
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

// =============================
// Session Templates
// =============================

// Primary lift key: "squat" | "bench" | "deadlift" | "squat_var" | "bench_var" | "deadlift_var"
type PrimaryLiftKey = 'squat' | 'bench' | 'deadlift' | 'squat_var' | 'bench_var' | 'deadlift_var';

interface SessionTemplate {
  name: string;
  primary: PrimaryLiftKey;
  accessories: string[]; // exercise names looked up from catalog
}

const SESSION_TEMPLATES: Record<number, SessionTemplate[]> = {
  3: [
    { name: 'Squat Day', primary: 'squat', accessories: ['Leg Press', 'Split Squat', 'Plank'] },
    { name: 'Bench Day', primary: 'bench', accessories: ['Overhead Press', 'Barbell Row', 'Tricep Extension'] },
    { name: 'Deadlift Day', primary: 'deadlift', accessories: ['Romanian Deadlift', 'Lat Pulldown', 'Bicep Curl'] },
  ],
  4: [
    { name: 'Squat Day', primary: 'squat', accessories: ['Leg Press', 'Split Squat', 'Plank'] },
    { name: 'Bench Day', primary: 'bench', accessories: ['Tricep Extension', 'Lateral Raise'] },
    { name: 'Deadlift Day', primary: 'deadlift', accessories: ['Barbell Row', 'Bicep Curl'] },
    { name: 'Upper Day', primary: 'bench_var', accessories: ['Cable Row', 'Face Pull', 'Lateral Raise'] },
  ],
  5: [
    { name: 'Squat Day', primary: 'squat', accessories: ['Leg Press', 'Plank'] },
    { name: 'Bench Day', primary: 'bench', accessories: ['Tricep Extension', 'Lateral Raise'] },
    { name: 'Deadlift Day', primary: 'deadlift', accessories: ['Barbell Row', 'Bicep Curl'] },
    { name: 'Squat Var Day', primary: 'squat_var', accessories: ['Lunges', 'Dead Bug'] },
    { name: 'Bench Var Day', primary: 'bench_var', accessories: ['Cable Row', 'Face Pull'] },
  ],
  6: [
    { name: 'Squat Day', primary: 'squat', accessories: ['Leg Press', 'Plank'] },
    { name: 'Bench Day', primary: 'bench', accessories: ['Tricep Extension', 'Lateral Raise'] },
    { name: 'Deadlift Day', primary: 'deadlift', accessories: ['Barbell Row', 'Bicep Curl'] },
    { name: 'Squat Var Day', primary: 'squat_var', accessories: ['Split Squat', 'Dead Bug'] },
    { name: 'Bench Var Day', primary: 'bench_var', accessories: ['Cable Row', 'Face Pull'] },
    { name: 'DL Var Day', primary: 'deadlift_var', accessories: ['Pull-Up', 'Lateral Raise'] },
  ],
};

// Day offsets from Monday for each frequency
const DAY_OFFSETS: Record<number, number[]> = {
  3: [0, 2, 4],           // Mon, Wed, Fri
  4: [0, 1, 3, 4],        // Mon, Tue, Thu, Fri
  5: [0, 1, 2, 4, 5],     // Mon, Tue, Wed, Fri, Sat
  6: [0, 1, 2, 3, 4, 5],  // Mon-Sat
};

// Variation exercise names and their 1RM reduction factors relative to the parent competition lift
const VARIATION_MAP: Record<string, { name: string; factor: number }> = {
  squat_var: { name: 'Front Squat', factor: 0.80 },
  bench_var: { name: 'Incline Bench Press', factor: 0.85 },
  deadlift_var: { name: 'Romanian Deadlift', factor: 0.70 },
};

// =============================
// Utility Functions
// =============================

// Round weight to nearest 5 lbs
function round5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get the next Monday on or after a given date
function getNextMonday(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

// Add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Look up exercise ID by name from catalog. Returns null if not found.
function findExerciseId(catalog: { id: string; name: string }[], name: string): string | null {
  const exercise = catalog.find(e => e.name === name);
  return exercise ? exercise.id : null;
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
function generateWarmupSets(workingWeight: number): CreateProgramTargetSet[] {
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

// Generate working sets for a primary lift
function generateWorkingSets(reps: number, weight: number, rpe: number, setCount: number): CreateProgramTargetSet[] {
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
function generateAccessorySets(reps: number, rpe: number, setCount: number): CreateProgramTargetSet[] {
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

interface WeekParams {
  intensity: number;
  reps: number;
  rpe: number;
  workingSets: number;
  accessorySets: number;
  isDeload: boolean;
}

function calculateWeekParams(phase: BlockPhase, weekIndex: number, totalBlockWeeks: number): WeekParams {
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

export function generatePowerliftingProgram(input: PowerliftingGeneratorInput): CreateProgramPayload {
  const today = new Date();
  const meetDate = new Date(input.meetDate + 'T00:00:00');
  const totalWeeks = Math.floor((meetDate.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));

  if (totalWeeks < 1) {
    throw new Error(`Meet date must be at least 1 week away. Current gap: ${totalWeeks} weeks.`);
  }

  const { hypertrophyWeeks, strengthWeeks, peakingWeeks } = calculateBlockSplit(totalWeeks);
  const templates = SESSION_TEMPLATES[input.daysPerWeek];
  const dayOffsets = DAY_OFFSETS[input.daysPerWeek];
  const startDate = getNextMonday(today);

  // Build exercise ID lookup for primary lifts and variations
  const primaryLiftMap: Record<PrimaryLiftKey, { exerciseId: string; oneRepMax: number }> = {
    squat: { exerciseId: input.squatExerciseId, oneRepMax: input.squat1RM },
    bench: { exerciseId: input.benchExerciseId, oneRepMax: input.bench1RM },
    deadlift: { exerciseId: input.deadliftExerciseId, oneRepMax: input.deadlift1RM },
    squat_var: {
      exerciseId: findExerciseId(input.exerciseCatalog, VARIATION_MAP.squat_var.name) || input.squatExerciseId,
      oneRepMax: input.squat1RM * VARIATION_MAP.squat_var.factor,
    },
    bench_var: {
      exerciseId: findExerciseId(input.exerciseCatalog, VARIATION_MAP.bench_var.name) || input.benchExerciseId,
      oneRepMax: input.bench1RM * VARIATION_MAP.bench_var.factor,
    },
    deadlift_var: {
      exerciseId: findExerciseId(input.exerciseCatalog, VARIATION_MAP.deadlift_var.name) || input.deadliftExerciseId,
      oneRepMax: input.deadlift1RM * VARIATION_MAP.deadlift_var.factor,
    },
  };

  // Build blocks — only include phases with > 0 weeks
  const blockConfigs: { phase: BlockPhase; weekCount: number }[] = [
    { phase: HYPERTROPHY, weekCount: hypertrophyWeeks },
    { phase: STRENGTH, weekCount: strengthWeeks },
    { phase: PEAKING, weekCount: peakingWeeks },
  ].filter(config => config.weekCount > 0);

  let globalWeekCounter = 0; // Tracks week offset for session date calculation
  const blocks: CreateProgramBlock[] = [];

  for (let blockIndex = 0; blockIndex < blockConfigs.length; blockIndex++) {
    const { phase, weekCount } = blockConfigs[blockIndex];
    const isFirstBlock = blockIndex === 0;
    const weeks: CreateProgramWeek[] = [];

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
      const weekParams = calculateWeekParams(phase, weekIndex, weekCount);
      const isFirstWeek = isFirstBlock && weekIndex === 0;
      const weekName = weekParams.isDeload ? 'Deload' : null;
      const sessions: CreateProgramSession[] = [];

      // Sessions only generated for the first block
      if (isFirstBlock) {
        for (let sessionIndex = 0; sessionIndex < templates.length; sessionIndex++) {
          const template = templates[sessionIndex];
          const sessionDate = addDays(startDate, globalWeekCounter * 7 + dayOffsets[sessionIndex]);
          const targetExercises: CreateProgramTargetExercise[] = [];
          let exerciseOrder = 0;

          // Primary lift
          const primaryLift = primaryLiftMap[template.primary];
          const workingWeight = round5(primaryLift.oneRepMax * weekParams.intensity);
          exerciseOrder++;

          let primarySets: CreateProgramTargetSet[] = [];
          if (isFirstWeek) {
            const warmupSets = generateWarmupSets(workingWeight);
            const workingSets = generateWorkingSets(weekParams.reps, workingWeight, weekParams.rpe, weekParams.workingSets);
            primarySets = [...warmupSets, ...workingSets];
          }

          targetExercises.push({
            exercise_id: primaryLift.exerciseId,
            order_index: exerciseOrder,
            sets: primarySets,
          });

          // Accessory exercises
          for (const accessoryName of template.accessories) {
            const accessoryId = findExerciseId(input.exerciseCatalog, accessoryName);
            if (!accessoryId) continue; // Skip if exercise not in catalog

            exerciseOrder++;
            let accessorySets: CreateProgramTargetSet[] = [];
            if (isFirstWeek) {
              accessorySets = generateAccessorySets(phase.accessoryReps, weekParams.rpe, weekParams.accessorySets);
            }

            targetExercises.push({
              exercise_id: accessoryId,
              order_index: exerciseOrder,
              sets: accessorySets,
            });
          }

          sessions.push({
            order_index: sessionIndex + 1,
            name: template.name,
            session_date: formatDate(sessionDate),
            target_exercises: targetExercises,
          });
        }
      }

      weeks.push({
        week_number: weekIndex + 1,
        name: weekName,
        description: null,
        sessions,
      });

      globalWeekCounter++;
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
    name: `Powerlifting Meet Prep \u2014 ${totalWeeks}wk`,
    description: `${input.daysPerWeek} days/week | S/B/D: ${input.squat1RM}/${input.bench1RM}/${input.deadlift1RM}`,
    blocks,
  };
}
