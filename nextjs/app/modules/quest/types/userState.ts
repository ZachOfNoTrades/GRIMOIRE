export interface UserState {
  health: number;
  max_health: number;
  last_damage_check_date: string | null;
  last_review_ack_date: string | null;
}

export const DAMAGE_NEGATIVE_HABIT = 5;
export const DAMAGE_MISSED_DAILY = 3;
