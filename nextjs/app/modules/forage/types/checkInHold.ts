// A CheckInHoldReason is why a check-in keeps the current targets instead of changing them
export enum CheckInHoldReason {
  FewLoggedDays = 1,
  FewWeighIns = 2,
}

// A CheckInHold is a check-in that keeps the current targets, with the week's data against the user's minimums
export interface CheckInHold {
  reason: CheckInHoldReason;
  logged_days: number;
  min_logged_days: number;
  weigh_ins: number;
  min_weigh_ins: number;
}
