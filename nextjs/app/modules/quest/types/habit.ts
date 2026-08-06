import { Difficulty } from './task';

export interface Habit {
  id: string;
  user_id: string;
  title: string;
  difficulty: Difficulty;
  allow_positive: boolean;
  allow_negative: boolean;
  // Manual coin-reward override (persisted). Non-null replaces the difficulty-based reward on a
  // positive tap; null means use the per-difficulty factor. Negative-tap coin/HP damage is
  // unaffected — those stay difficulty-driven from settings.
  manual_reward_override: number | null;
  ts_created: Date;
}
