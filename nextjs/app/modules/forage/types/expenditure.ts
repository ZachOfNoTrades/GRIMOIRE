// Client-safe view of the adaptive expenditure estimate — the JSON shape of
// GET /modules/forage/api/expenditure. Kept here rather than in lib/expenditure
// so client components can type the response without importing that module (it
// pulls the DB layer in with it).

export type ExpenditureMethod = 'adaptive' | 'formula';

export interface ExpenditureSummary {
  expenditure_kcal: number;
  method: ExpenditureMethod;
  floor_kcal: number;
  latest_weight_lb: number | null;
  // Debug/UI context: how the adaptive number was arrived at (all null on the
  // formula fallback except window_days).
  logged_days: number | null;
  weigh_ins: number | null;
  avg_intake_kcal: number | null;
  weight_trend_lb_per_week: number | null;
  window_days: number;
  balance_start_date: string | null;
  balance_end_date: string | null;
}
