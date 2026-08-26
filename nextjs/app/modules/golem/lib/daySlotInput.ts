import type { DaySlotInput } from '../types/dayArchetype';

// A slot body the caller got wrong (not a server fault) — routes turn this into a 400, not a 500.
export class DaySlotInputError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A slot's exercise/muscle references are uniqueidentifier columns: anything that isn't a UUID (or
// null) blows up in the driver as a conversion error. Reject it here rather than silently coercing to
// null — a pin that quietly becomes "no pin" is exactly the silent-drop failure pins must never have.
function uuidOrNull(value: any, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new DaySlotInputError(`${field} must be a UUID or null`);
  }
  return value.trim();
}

// Coerce a request body into a DaySlotInput with sensible defaults. Lives in lib
// (not a route file) because Next.js route modules may only export HTTP handlers
// and recognised config fields — exporting this from a route fails the build.
export function coerceDaySlotInput(body: any): DaySlotInput {
  return {
    order_index: Number(body?.order_index) || 1,
    role: body?.role || 'secondary',
    target_muscle_group_id: uuidOrNull(body?.target_muscle_group_id, 'target_muscle_group_id'),
    category_filter: body?.category_filter || 'Strength',
    rotation_cadence: body?.rotation_cadence || 'per_session',
    pinned_exercise_id: uuidOrNull(body?.pinned_exercise_id, 'pinned_exercise_id'),
    is_optional: !!body?.is_optional,
    is_warmup: !!body?.is_warmup,
    progression_model: body?.progression_model || 'double_progression',
    rep_low: Number(body?.rep_low) || 8,
    rep_high: Number(body?.rep_high) || 12,
    time_low_seconds: body?.time_low_seconds === null || body?.time_low_seconds === undefined || body?.time_low_seconds === '' ? null : Number(body.time_low_seconds),
    time_high_seconds: body?.time_high_seconds === null || body?.time_high_seconds === undefined || body?.time_high_seconds === '' ? null : Number(body.time_high_seconds),
    target_rpe: body?.target_rpe === null || body?.target_rpe === undefined ? null : Number(body.target_rpe),
    load_step_pct: body?.load_step_pct === undefined ? 0.05 : Number(body.load_step_pct),
    round_to_step: body?.round_to_step === undefined ? 5 : Number(body.round_to_step),
    set_target: Number(body?.set_target) || 3,
  };
}
