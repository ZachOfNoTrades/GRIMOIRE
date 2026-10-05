// Column-derived limits for the quest write surface, shared by the task and habit routes.
//
// quest_tasks.title / quest_habits.title are NVARCHAR(500) and both manual_reward_override
// columns are DECIMAL(10,2). Values outside those bounds never reach SQL Server as a constraint
// violation — the tedious driver rejects the parameter itself ("Data type 0xE7 has an invalid
// data length", "not a valid instance of data type decimal"), which surfaced as an opaque 500
// with no indication of which field was wrong. Validate here so the caller gets a 400 that names
// the field, matching what the rewards route already does for its own NVARCHAR(255) name column.

export const TITLE_MAX_LENGTH = 500;
export const REWARD_OVERRIDE_MAX = 99999999.99;

// Trim a request title and check it against the column width. Returns the trimmed title, or an
// error message for the caller to return as a 400.
export function validateTitle(
  value: unknown,
  field = 'Title',
): { title: string } | { error: string } {
  const title = (value ?? '').toString().trim();
  if (!title) return { error: `${field} is required` };
  if (title.length > TITLE_MAX_LENGTH) {
    return { error: `${field} must be ${TITLE_MAX_LENGTH} characters or fewer` };
  }
  return { title };
}

// Coerce a request value into a manual reward override: null/undefined/empty/invalid/negative ->
// null (no override, fall back to the difficulty-based reward); a finite non-negative number
// within the column's range -> that number. A number the column cannot hold is an error rather
// than a silent clamp, so the user is never saved a reward they did not type.
export function parseRewardOverride(
  value: unknown,
): { value: number | null } | { error: string } {
  if (value === null || value === undefined || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { value: null };
  if (n > REWARD_OVERRIDE_MAX) {
    return { error: `Reward override must be ${REWARD_OVERRIDE_MAX} or less` };
  }
  return { value: n };
}
