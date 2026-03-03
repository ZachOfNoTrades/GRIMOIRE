Generate exercises and sets for a single training session.

## Output Schema

Respond with a valid JSON object matching the following TypeScript schema.

interface TargetSet {
set_number: number; // Sequential within warmup/working groups (starts at 1)
is_warmup: boolean; // true for warmup sets, false for working sets
reps: number; // Positive integer
weight: number; // Weight in pounds (use 0 for bodyweight exercises or when weight varies by person)
rpe: number | null; // Rate of perceived exertion 1-10, or null
}

interface TargetExercise {
exercise_id: string; // MUST be a valid UUID from the exercises table
order_index: number; // Sequential starting at 1 within this session
sets: TargetSet[];
}

interface SessionTargets {
target_exercises: TargetExercise[];
}

// Your response: SessionTargets (a single object, NOT an array)

## Session Info

- **Session Name**: {{SESSION_NAME}}
- **Description**: {{USER_DESCRIPTION}}

## Rules

1. Every exercise_id MUST be a valid UUID from the exercises table. Use the SQL Query skill to discover available exercises (query by muscle group, name, etc.).
2. Include an appropriate quantity of exercises based on the session description. If unsure, use 5 as a fallback.
3. The first exercise should be the primary compound movement for the session.
4. For compound exercises, include warmup sets ramping up to working weight, then working sets.
5. set_number starts at 1 and increments independently for warmup sets and working sets within each exercise.
6. Round all weights to the nearest 5 lbs.
7. The response must be a single JSON object with a target_exercises array — nothing else.

{{TEMPLATE_CONTEXT}}
