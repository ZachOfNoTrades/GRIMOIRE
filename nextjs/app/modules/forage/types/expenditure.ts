// Client-safe view of the adaptive expenditure estimate — the JSON shape of
// GET /modules/forage/api/expenditure. Kept here rather than in lib/expenditure
// so client components can type the response without importing that module (it
// pulls the DB layer in with it).

export type ExpenditureMethod = 'adaptive' | 'formula';

// One day of the rolling estimate — the whole blend-and-smooth re-run over the
// history ending on that date. Ascending by date.
export interface ExpenditureDailyPoint {
  date: string;
  expenditure_kcal: number;
  method: ExpenditureMethod;
  // True when the day's own window couldn't support the balance model, so the
  // point holds the previous day's estimate rather than jumping models.
  carried: boolean;
}

// What one horizon of the blend had to say, and how much of the blend it took.
// Surfaced so a surprising number can be taken apart ("the 28-day read is 500
// low, but it only saw 9 days") rather than guessed at.
export interface ExpenditureHorizon {
  horizon_days: number;
  expenditure_kcal: number;
  avg_intake_kcal: number;
  // The trend as USED — i.e. after the estimator's physiological clamp.
  weight_trend_lb_per_week: number;
  logged_days: number;
  weigh_ins: number;
  // Complete logged days as a fraction of the balance window's calendar days.
  coverage: number;
  balance_start_date: string;
  balance_end_date: string;
  // Share of the blend, 0..1.
  weight: number;
}

export interface ExpenditureSummary {
  expenditure_kcal: number;
  method: ExpenditureMethod;
  floor_kcal: number;
  latest_weight_lb: number | null;
  // Debug/UI context, taken from the horizon that carried the most weight in
  // the blend (all null on the formula fallback except window_days and
  // smoothing_days).
  logged_days: number | null;
  weigh_ins: number | null;
  avg_intake_kcal: number | null;
  weight_trend_lb_per_week: number | null;
  // The dominant horizon's length. Not the only stretch the estimate saw — see
  // `horizons` — but the one that shaped it most.
  window_days: number;
  coverage: number | null;
  // How many trailing days of the horizon blend the headline averaged.
  smoothing_days: number;
  balance_start_date: string | null;
  balance_end_date: string | null;
  // Every horizon that contributed, shortest first. Empty on the fallback.
  horizons: ExpenditureHorizon[];
  // Trailing per-day estimates, oldest first — what the dashboard's Expenditure
  // card plots so the number reads as a moving estimate, not one flat figure.
  daily: ExpenditureDailyPoint[];
}
