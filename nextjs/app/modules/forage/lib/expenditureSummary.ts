import { FLOOR_MIN_KCAL } from './program';
import { estimateExpenditure, DAILY_SERIES_DAYS } from './expenditure';
import { getActiveProgram } from './programFunctions';
import { getLatestWeightLb } from './weightFunctions';
import { TrainingKind } from '../types/program';
import { ExpenditureSummary } from '../types/expenditure';

// The expenditure estimate as the dashboard and the goal wizard read it: the
// estimator run with the active program's training kind, plus the program's
// calorie floor and the latest weigh-in. Shared by GET /api/expenditure and the
// dashboard's server preload so both hand the client the same object. Kept out
// of lib/expenditure because programFunctions imports that module.
//
// With no active program the training kind falls back to 'none' and the floor to
// 'standard' — the training multiplier only matters for the bodyweight-formula
// fallback, since the adaptive estimate already reflects real activity.
export async function getExpenditureSummary(
  userId: string,
  dailySeriesDays: number = DAILY_SERIES_DAYS,
): Promise<ExpenditureSummary> {
  const [latestWeightLb, program] = await Promise.all([getLatestWeightLb(userId), getActiveProgram(userId)]);
  const trainingKind: TrainingKind = (program?.training_kind as TrainingKind) ?? 'none';
  const expenditure = await estimateExpenditure(userId, { trainingKind, latestWeightLb, dailySeriesDays });
  return {
    ...expenditure,
    floor_kcal: FLOOR_MIN_KCAL[program?.floor_kind ?? 'standard'],
    latest_weight_lb: latestWeightLb,
  };
}
