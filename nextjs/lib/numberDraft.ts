// Read and settle the text a person types into a number field.
// NOTE: The text is kept as typed while editing; limits apply only when the field is left.

export interface NumberDraftLimits {
  min?: number;
  max?: number;
  integer?: boolean; // Round to a whole number when the field is left
}

// Read a draft as a number, or null while it is empty or half typed ("-", ".")
export function parseNumberDraft(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Show a stored number as draft text, empty for null
export function formatNumberDraft(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

// Apply a field's limits to a draft when it is left; an empty draft stays empty
export function settleNumberDraft(text: string, limits: NumberDraftLimits = {}): number | null {
  const parsed = parseNumberDraft(text);
  if (parsed == null) return null;
  let settled = limits.integer ? Math.round(parsed) : parsed;
  if (limits.min != null) settled = Math.max(limits.min, settled);
  if (limits.max != null) settled = Math.min(limits.max, settled);
  return settled;
}
