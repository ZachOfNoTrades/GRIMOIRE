import { CheckInHold, CheckInHoldReason } from '../types/checkInHold';

// Decide whether a check-in keeps the current targets
export function findCheckInHold(
  week: { logged_days: number; weigh_ins: number },
  minimums: { min_logged_days: number; min_weigh_ins: number },
): CheckInHold | null {
  const counts = { ...week, ...minimums };
  if (week.logged_days < minimums.min_logged_days) return { reason: CheckInHoldReason.FewLoggedDays, ...counts };
  if (week.weigh_ins < minimums.min_weigh_ins) return { reason: CheckInHoldReason.FewWeighIns, ...counts };
  return null;
}
