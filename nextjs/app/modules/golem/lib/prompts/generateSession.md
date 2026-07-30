Generate exercises and sets for a single training session.

## Schema

interface TargetSet {
set_number: number; // Sequential within warmup/working groups (starts at 1)
is_warmup: boolean; // true for warmup sets, false for working sets
reps: number | null; // Positive integer for rep-based exercises, null for timed exercises
weight: number; // Weight in pounds (use 0 for bodyweight exercises or when weight varies by person)
rpe: number | null; // Rate of perceived exertion 1-10, or null
time_seconds: number | null; // Duration in seconds for timed exercises, null for rep-based exercises
}

interface TargetExercise {
exercise_id: string; // MUST be a valid UUID from the exercises table
modifier_id: string | null; // Optional UUID from exercise_modifiers table (e.g., Pause, Tempo, Deficit)
order_index: number; // Sequential starting at 1, tracked independently per warmup/working group
is_warmup: boolean; // true for warmup/mobility exercises (stretches, dynamic warmups), false for working exercises
sets: TargetSet[];
}

interface SuggestedExercise {
name: string; // Descriptive name for the new exercise
description: string | null; // Brief description of form/technique
category: string; // "Strength", "Cardio", or "Mobility"
is_timed: boolean; // true for duration-based exercises (planks, holds), false for rep-based
modifier_id: string | null; // Optional UUID from exercise_modifiers table
order_index: number; // Same rules as TargetExercise.order_index
is_warmup: boolean; // Same rules as TargetExercise.is_warmup
sets: TargetSet[];
}

interface SessionTargets {
target_exercises: TargetExercise[]; // Exercises using existing exercise IDs
suggested_exercises?: SuggestedExercise[]; // New exercises to create (user will approve before adding)
}

// Your response: SessionTargets (a single object, NOT an array)

## Session Info

- **Session ID**: {{SESSION_ID}}
- **Session Name**: {{SESSION_NAME}}
- **Description**: {{USER_DESCRIPTION}}

## Historical Context

Before generating exercises, use the SQL Query skill to gather relevant context. The session ID above can be used to traverse the program hierarchy (session → week → block → program). Consider querying:

1. **Program context** — The session's block tag/description and week description to understand the current training phase and goals.
2. **Sibling sessions** — Other session names/descriptions in the same week, so exercises complement rather than duplicate across the week.
3. **Previous analyses** — The `analysis` column on completed sessions in the same program. These analyses are specifically written as context for future session generation and may contain injury observations, recovery notes, warmup suggestions, and performance trends.
4. **Recent performance** — The user's recent sets/reps/weight on exercises you are considering prescribing, to inform appropriate loading.
5. **Exercise frequency** — Which exercises have been used recently and which have not, to ensure variety.

## Rules

1. Every exercise_id in `target_exercises` MUST be a valid UUID from the exercises table. Use the SQL Query skill to discover available exercises (query by muscle group, name, etc.). **Only use exercises ENABLED at the governing location** — enabled state is per-location in `location_exercise_overrides`. The equipment section(s) below give the exact location id(s) and the join/filter to apply. **If warmup and working exercises use different locations, the warmup section governs warmup exercises (`is_warmup: true`) and the working section governs working exercises (`is_warmup: false`)** — apply each location's enabled-list filter and equipment to the matching exercise type. If a governing location is bodyweight-only, restrict that exercise type to bodyweight movements.
2. Include an appropriate quantity of exercises based on the session description. If unsure, use 5 as a fallback.
3. `order_index` starts at 1 and increments independently for warmup exercises and working exercises. Order indices span across both `target_exercises` and `suggested_exercises` — they share the same sequence.
4. Warmup exercises (`is_warmup: true`) MUST have all sets with `is_warmup: true`. They should not contain working sets.
5. set_number starts at 1 and increments independently for warmup sets and working sets within each exercise.
6. The response must be a single JSON object with `target_exercises` and optionally `suggested_exercises` — nothing else.
7. For timed exercises (`is_timed = 1` in the exercises table), set `reps` to null and use `time_seconds` for the duration. For rep-based exercises (`is_timed = 0`), set `time_seconds` to null and use `reps`. Check the `is_timed` column when querying exercises. For suggested exercises, set `is_timed` appropriately based on the exercise type.
8. If volume landmarks are provided, ensure this session's working sets contribute toward (not exceed) the weekly MRV for each targeted muscle group. Use the SQL Query skill to check how many working sets have already been logged or prescribed for each muscle group this week before prescribing additional sets.
9. **Suggesting new exercises:** If the session description calls for exercises that do not exist in the database (e.g., yoga poses, sport-specific drills, or other movements not in the library), include them in `suggested_exercises`. Only suggest exercises when suitable options genuinely do not exist — always prefer existing exercises. The user will review and approve suggested exercises before they are added.

{{VOLUME_LANDMARKS}}

{{PRE_SURVEY}}

{{LOCATION_EQUIPMENT}}

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
