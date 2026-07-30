import { Difficulty } from './task';

export type QuestFactors = Record<Difficulty, number>;
export type DifficultyMap = Record<Difficulty, number>;

export interface QuestSettings {
  user_id: string;
  factor_easy: number;
  factor_medium: number;
  factor_hard: number;
  factor_max: number;
  damage_factor: number;
  coin_damage_easy: number;
  coin_damage_medium: number;
  coin_damage_hard: number;
  coin_damage_max: number;
  health_damage_easy: number;
  health_damage_medium: number;
  health_damage_hard: number;
  health_damage_max: number;
  simulation_date: string | null;
  streak_factor: number;
  streak_cap: number;
  neglect_factor: number;
  neglect_cap: number;
  advanced_mode: boolean;
  // reward_formula is the DAILY reward formula in the split-formula design (legacy column name).
  reward_formula: string | null;
  todo_reward_formula: string | null;
  // streak_bonus_formula is repurposed as the unified DAMAGE formula (legacy column name).
  streak_bonus_formula: string | null;
  todo_bonus_enabled: boolean;
  todo_bonus_daily_chance: number;
  todo_bonus_multiplier: number;
  todo_bonus_age_bias: number;
  // Debug-only manual override; when non-null, attachReward treats this todo as today's bonus
  // regardless of the daily roll. Set/cleared via the debug page.
  forced_todo_bonus_id: string | null;
  // Daily digest email. digest_time is local-clock HH:MM:SS; digest_last_sent_date is the
  // user's simulated `today` the last digest covered (de-dupe key for the scheduler).
  digest_enabled: boolean;
  digest_time: string;
  digest_last_sent_date: string | null;
  // Bonus-task notification: announces today's randomly selected bonus todo. Mirrors digest fields.
  bonus_notif_enabled: boolean;
  bonus_notif_time: string;
  bonus_notif_last_sent_date: string | null;
  bonus_notif_always: boolean;
  // Master switch for per-task reminder emails. Unlike the digest legs, reminders are driven by
  // quest_task_reminders rows, so this is the single flag the unsubscribe link can turn off.
  reminders_enabled: boolean;
  // Retroactive daily completion. retro_completion_enabled toggles the feature;
  // retro_completion_multiplier is the fraction (0..1) of coins paid for a late completion;
  // retro_lookback_days bounds how many days back a daily may be retro-completed.
  retro_completion_enabled: boolean;
  retro_completion_multiplier: number;
  retro_lookback_days: number;
  // "All dailies complete" bonus: pays all_dailies_bonus_amount coins once per day, the moment
  // every daily scheduled for today becomes done. all_dailies_bonus_last_awarded_date is the
  // idempotency stamp (mirrors digest_last_sent_date / bonus_notif_last_sent_date).
  all_dailies_bonus_enabled: boolean;
  all_dailies_bonus_amount: number;
  all_dailies_bonus_last_awarded_date: string | null;
  ts_created: Date;
  ts_modified: Date;
}

export const DEFAULT_FACTORS: QuestFactors = {
  easy: 0.25,
  medium: 0.5,
  hard: 1,
  max: 2,
};

export const DEFAULT_DAMAGE_FACTOR = 1.0;

export const DEFAULT_COIN_DAMAGE: DifficultyMap = {
  easy: 0.25,
  medium: 0.5,
  hard: 1.0,
  max: 2.0,
};

export const DEFAULT_HEALTH_DAMAGE: DifficultyMap = {
  easy: 5,
  medium: 5,
  hard: 5,
  max: 5,
};

export const DEFAULT_STREAK_FACTOR = 0.05;
export const DEFAULT_STREAK_CAP = 30;
export const DEFAULT_NEGLECT_FACTOR = 0.05;
export const DEFAULT_NEGLECT_CAP = 30;

// Random "aged todo" bonus. Disabled by default; when enabled, on each effective `today` we roll
// once against `daily_chance` (percentage in [0,100]) — on a hit, one of the user's todos created
// before today is age-weighted-selected (weight = (age + 1) ^ age_bias) and gets its reward
// multiplied by `multiplier` for the day. age_bias 0 = uniform, positive = favour older,
// negative = favour newer.
export const DEFAULT_TODO_BONUS_ENABLED = false;
export const DEFAULT_TODO_BONUS_DAILY_CHANCE = 20;
export const DEFAULT_TODO_BONUS_MULTIPLIER = 3.0;
export const DEFAULT_TODO_BONUS_AGE_BIAS = 1.0;

// Defaults shown in the advanced-mode formula editor. Each formula returns the *total* value:
//   - DAILY reward formula uses `streak`. Linear-capped: +3% per consecutive day, max +60% at
//     day 20. Predictable; the visible streak counter does the motivating heavy-lifting since
//     dailies here are reminders, not habit-builders.
//   - TODO reward formula uses `age` (days since creation). Saturating curve capped at +15%.
//     Half-cap at age=3, ~+10.5% at age=7, ~+13.6% at age=30. Diminishing margins make
//     waiting-one-more-day worth almost nothing, killing the hoarding incentive while still
//     paying a visible bonus on stale items.
//   - DAMAGE formula uses `neglect`. Linear-capped, slightly steeper than the reward side: +7%
//     per missed day, max ~+98% at day 14. Aggressive enough to motivate getting back on track,
//     but capped so a long-neglected task can't one-shot you.
// Daily digest email defaults. Off by default; 08:00 local is a reasonable morning slot.
export const DEFAULT_DIGEST_ENABLED = false;
export const DEFAULT_DIGEST_TIME = '08:00';

// Bonus-task notification defaults. Off by default; same morning slot as the digest.
export const DEFAULT_BONUS_NOTIF_ENABLED = false;
export const DEFAULT_BONUS_NOTIF_TIME = '08:00';
export const DEFAULT_BONUS_NOTIF_ALWAYS = false;
// Reminders predate their own switch, so they stay on unless the user (or an unsubscribe) turns
// them off — matching the DEFAULT 1 on quest_settings.reminders_enabled.
export const DEFAULT_REMINDERS_ENABLED = true;

// Retroactive daily completion defaults. Enabled by default; a late completion pays half coins and
// may reach back up to two weeks.
export const DEFAULT_RETRO_COMPLETION_ENABLED = true;
export const DEFAULT_RETRO_COMPLETION_MULTIPLIER = 0.5;
export const DEFAULT_RETRO_LOOKBACK_DAYS = 14;

// "All dailies complete" bonus defaults. Off by default; 5 coins is a modest flat top-up.
export const DEFAULT_ALL_DAILIES_BONUS_ENABLED = false;
export const DEFAULT_ALL_DAILIES_BONUS_AMOUNT = 5.0;

export const DEFAULT_DAILY_REWARD_FORMULA = 'base * (1 + 0.03 * min(streak, 20))';
export const DEFAULT_TODO_REWARD_FORMULA = 'base * (1 + 0.15 * age / (age + 3))';
export const DEFAULT_DAMAGE_FORMULA = 'base * (1 + 0.07 * min(neglect, 14))';

export function settingsToFactors(s: QuestSettings): QuestFactors {
  return {
    easy: Number(s.factor_easy),
    medium: Number(s.factor_medium),
    hard: Number(s.factor_hard),
    max: Number(s.factor_max),
  };
}

export function settingsToCoinDamage(s: QuestSettings): DifficultyMap {
  return {
    easy: Number(s.coin_damage_easy),
    medium: Number(s.coin_damage_medium),
    hard: Number(s.coin_damage_hard),
    max: Number(s.coin_damage_max),
  };
}

export function settingsToHealthDamage(s: QuestSettings): DifficultyMap {
  return {
    easy: Number(s.health_damage_easy),
    medium: Number(s.health_damage_medium),
    hard: Number(s.health_damage_hard),
    max: Number(s.health_damage_max),
  };
}
