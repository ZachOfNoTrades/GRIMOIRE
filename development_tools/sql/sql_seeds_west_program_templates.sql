-- ============================================================
-- Seed Data: Program Templates
-- Run after sql_init_west.sql to populate default templates.
--
-- NOTE: Each prompt field stores only domain-specific context.
-- Formatting rules (output schema, response rules) live in
-- tracked .md files under nextjs/app/modules/west/lib/prompts/.
-- ============================================================

-- Powerlifting Template (default)
INSERT INTO program_templates (id, name, description, program_prompt, week_prompt, session_prompt, days_per_week)
VALUES (
  'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
  'Powerlifting',
  'Standard powerlifting program template with prompts for program, week, and session generation.',

  -- program_prompt (powerlifting structure context injected into generateProgram.md)
  N'## Program Type: Powerlifting Meet Prep

### Periodization Guidelines

- Use a linear periodization model with distinct training phases.
- Block order: Hypertrophy → Strength → Peaking.
- Each block should use the following tags and colors:
  - Hypertrophy: tag "Hypertrophy", color "#3B82F6"
  - Strength: tag "Strength", color "#F59E0B"
  - Peaking: tag "Peaking", color "#EF4444"
- Include a deload week (named "Deload") every 4th week within longer blocks.
- Program name should include the total week count (e.g., "Powerlifting Meet Prep — 12wk").',

  -- week_prompt (powerlifting-specific context injected into generateWeekPlan.md)
  N'## Program Type: Powerlifting

### Block Context

- **Block**: {{BLOCK_NAME}} ({{BLOCK_TAG}})
- **Intensity Range**: {{INTENSITY_MIN}}% – {{INTENSITY_MAX}}% of 1RM
- **Rep Range**: {{REP_MIN}} – {{REP_MAX}} reps per working set
- **Working Sets**: {{WORKING_SETS}} per primary exercise
- **Base RPE**: {{BASE_RPE}}

### Lifter Profile

| Lift     | Exercise                   | Estimated 1RM        |
| -------- | -------------------------- | -------------------- |
| Squat    | {{SQUAT_EXERCISE_NAME}}    | {{SQUAT_1RM}} lbs    |
| Bench    | {{BENCH_EXERCISE_NAME}}    | {{BENCH_1RM}} lbs    |
| Deadlift | {{DEADLIFT_EXERCISE_NAME}} | {{DEADLIFT_1RM}} lbs |

### Powerlifting Rules

1. Each session must have exactly one primary competition lift (squat, bench, or deadlift).
2. Session names should reflect the primary lift and focus if applicable.',

  -- session_prompt (powerlifting-specific context injected into generateSession.md)
  N'## Program Type: Powerlifting

### Exercise Selection Guidelines

1. The first exercise should always be the competition lift indicated by the session name.
2. Follow the competition lift with 2-4 accessory exercises that support it:
   - Squat day: front squats, leg press, lunges, leg curls, core work.
   - Bench day: close-grip bench, dumbbell press, rows, tricep work, shoulder accessories.
   - Deadlift day: Romanian deadlifts, barbell rows, pull-ups, hip thrusts, back extensions.
3. Use 0 for weight on accessory exercises (user fills in their own weight).

### Set and Rep Guidelines

- Competition lifts: include 3-4 warmup sets ramping from 50% to 80% of working weight, then 3-5 working sets.
- Accessory exercises: 3-4 working sets, no warmup sets needed.
- RPE guidance: competition lifts RPE 7-9, accessories RPE 7-8.',

  -- days_per_week
  4
);
