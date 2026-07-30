Design a periodized workout program's *structure* and attach a **day archetype** to every training day. You do NOT choose specific exercises, sets, weeks-of-the-week, or session-by-session details — a deterministic engine fills each day with exercises later, using its archetype as the template. Your job is only to:

1. Decide the program length and split it into **blocks** (phases), each with a length and a purpose.
2. For **each block**, assign an archetype to each of the (fixed) training days of the week — reusing an existing archetype when one fits, or creating a new one with its slots.

The number of training days per week is fixed at **{{DAYS_PER_WEEK}}** and is NOT yours to change. Every week within a block repeats the same day→archetype assignment.

## What a day archetype is

A day archetype is a reusable "kind of day" (e.g. *Upper Push*, *Lower*, *Conditioning*) defined as an ordered list of **slots**. Each slot tells the engine what to fill that position with — a role, a target muscle, a category, a progression model, and a rep or time range. The engine picks the actual exercise and load from the user's history.

Progression is tracked **per archetype** (sessions sharing an archetype progress from one another). So if "Upper Push" is day 1 of every week in a block, assign the *same* archetype to that day in every week — which happens automatically here, since a block's day assignment repeats each week. Reuse the same archetype across blocks too when the day's intent is unchanged.

## Schema

```
interface ArchetypeSlot {
  role: "primary" | "secondary" | "isolation" | "unilateral" | "core" | "carry" | "conditioning";
  target_muscle: string;        // MUST be one of the muscle group names listed in "Muscle Groups" below
  category: "Strength" | "Cardio" | "Mobility";
  progression_model: "double_progression" | "linear" | "rpe_pct1rm" | "time_effort";
  rep_low?: number;             // rep-based models (omit for Cardio time_effort)
  rep_high?: number;
  time_low_seconds?: number;    // ONLY for Cardio + time_effort (a timed dose, e.g. 600)
  time_high_seconds?: number;   // ONLY for Cardio + time_effort
  target_rpe?: number | null;   // set on EVERY Strength slot (incl. timed holds); null ONLY for Cardio/conditioning
  set_target: number;           // working-set count (e.g. 3)
  rotation_cadence?: "never" | "per_block" | "per_session"; // default "per_session"
  is_optional?: boolean;        // default false
}

interface NewArchetype {
  key: string;                  // a short unique id you invent (e.g. "push") to reference this archetype below
  name: string;                 // display name (e.g. "Upper Push")
  slots: ArchetypeSlot[];       // ordered; index 0 is the first exercise of the day
}

interface DayAssignment {
  day_index: number;            // 1..{{DAYS_PER_WEEK}} — position of this day within the week
  archetype_key?: string;       // reference a NewArchetype.key you declared, OR
  archetype_existing_id?: string; // reference an existing archetype id from "Existing Archetypes"
}

interface BlockPlan {
  order_index: number;          // 1-based block order
  name: string;                 // e.g. "Hypertrophy Phase"
  tag: string;                  // short purpose label, e.g. "Hypertrophy", "Strength", "Peak", "Deload"
  color?: string | null;        // optional hex color, e.g. "#3B82F6"
  week_count: number;           // length of the block in weeks
  days: DayAssignment[];        // EXACTLY {{DAYS_PER_WEEK}} entries, day_index 1..{{DAYS_PER_WEEK}}
}

interface Output {
  program: { name: string; description?: string | null };
  new_archetypes: NewArchetype[];
  blocks: BlockPlan[];
}
```

## Rules

1. The file must be a single JSON object matching `Output` — nothing else.
2. **Program length**: if the guidance below states a length (total weeks or number of blocks), honor it exactly. Otherwise choose a sensible periodized length. The total program length is the sum of every block's `week_count`.
3. Each block must have `week_count >= 1` and EXACTLY {{DAYS_PER_WEEK}} entries in `days` (day_index 1..{{DAYS_PER_WEEK}}, each unique).
4. Each `DayAssignment` must set EXACTLY ONE of `archetype_key` (a key you declared in `new_archetypes`) or `archetype_existing_id` (an id from the Existing Archetypes list). Prefer reusing a suitable existing archetype over creating a near-duplicate.
5. **Declare each distinct archetype once** in `new_archetypes` and reference its key wherever that day appears (across days/blocks). Do not declare duplicate archetypes for the same kind of day.
6. `target_muscle` must be copied verbatim from the Muscle Groups list. Build each archetype from several slots covering complementary muscles (e.g. an Upper Push day: chest, then shoulders, then triceps).
7. Slot guidance:
   - Strength work: `category: "Strength"`, `progression_model: "double_progression"` (or `"linear"` for heavy compounds, `"rpe_pct1rm"` for explicitly RPE-anchored loading), with `rep_low`/`rep_high`. ALWAYS set `target_rpe` on Strength slots: it is required for `rpe_pct1rm`, and for `double_progression`/`linear` it both shows the user a per-set intensity target and arms the engine's overreach auto-regulation. Pick the RPE from the slot's intent (e.g. ~7 for accessory/secondary, ~7.5–8.5 for top working sets, lower in deloads).
   - Cardio/conditioning: `category: "Cardio"`, `progression_model: "time_effort"`, with `time_low_seconds`/`time_high_seconds` and `target_rpe: null` (effort is dosed by duration, not RPE). Do NOT set rep fields. The engine emits one timed bout per working set, so `set_target` IS the number of bouts: for steady-state conditioning use `set_target: 1` with a single longer dose (e.g. `time_low_seconds: 480`, `time_high_seconds: 720` for ~8–12 min). ONLY use `set_target > 1` for deliberate intervals, and then make the per-bout `time_low/high` the length of ONE interval (e.g. 8×60s = `set_target: 8`, `time_low_seconds: 60`). Never spread a single continuous effort across many short sets.
   - Timed strength holds (e.g. planks, `role: "core"` or `"carry"`): `progression_model: "time_effort"`, `category: "Strength"`, and NO time range — the engine self-reports duration then progresses from logged history. STILL set `target_rpe` here (e.g. ~7–8): on the first exposure there is no logged duration to anchor to, so the RPE is the user's only intensity target ("hold to RPE 8").
8. Match the archetype mix to each block's purpose (e.g. lower rep ranges / `linear` or `rpe_pct1rm` in a Strength block, higher rep ranges / `double_progression` in a Hypertrophy block). Reuse archetypes across blocks where the intent is the same.
9. Do not name or reference specific exercises anywhere — only roles and target muscles. The engine selects exercises. Session names and descriptions are not yours to write.

## Muscle Groups

Use these names verbatim for `target_muscle`:

{{MUSCLE_GROUPS}}

## Existing Archetypes

Reuse these by `archetype_existing_id` when one fits; otherwise declare new ones. (Empty means the user has none yet.)

{{EXISTING_ARCHETYPES}}

## Program Guidance

{{PROGRAM_PROMPT}}

## Block / Phase Guidance

{{BLOCK_PROMPT}}

## Per-Block Progression Guidance

{{WEEK_PROMPT}}

{{PROFILE_CONTEXT}}
