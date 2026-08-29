import sql from 'mssql';
import { getQuestConnection } from './db';
import { getMainConnection } from '@/lib/db';
import {
  QuestFactors,
  QuestSettings,
  DifficultyMap,
  DEFAULT_FACTORS,
  DEFAULT_DAMAGE_FACTOR,
  DEFAULT_COIN_DAMAGE,
  DEFAULT_HEALTH_DAMAGE,
  DEFAULT_STREAK_FACTOR,
  DEFAULT_STREAK_CAP,
  DEFAULT_NEGLECT_FACTOR,
  DEFAULT_NEGLECT_CAP,
  DEFAULT_TODO_BONUS_ENABLED,
  DEFAULT_TODO_BONUS_DAILY_CHANCE,
  DEFAULT_TODO_BONUS_MULTIPLIER,
  DEFAULT_TODO_BONUS_AGE_BIAS,
  DEFAULT_DIGEST_ENABLED,
  DEFAULT_DIGEST_TIME,
  DEFAULT_BONUS_NOTIF_ENABLED,
  DEFAULT_BONUS_NOTIF_TIME,
  DEFAULT_BONUS_NOTIF_ALWAYS,
  DEFAULT_RETRO_COMPLETION_ENABLED,
  DEFAULT_RETRO_COMPLETION_MULTIPLIER,
  DEFAULT_RETRO_LOOKBACK_DAYS,
  DEFAULT_ALL_DAILIES_BONUS_ENABLED,
  DEFAULT_ALL_DAILIES_BONUS_AMOUNT,
  settingsToFactors,
  settingsToCoinDamage,
  settingsToHealthDamage,
} from '../types/settings';
import type { TodoBonusConfig } from './todoBonusFunctions';
import { DEFAULT_GAMBLE_WEEK_START_DAY, normalizeWeekStartDay } from './gambleConfig';

const SETTINGS_COLUMNS = `user_id,
  factor_easy, factor_medium, factor_hard, factor_max,
  damage_factor,
  coin_damage_easy, coin_damage_medium, coin_damage_hard, coin_damage_max,
  health_damage_easy, health_damage_medium, health_damage_hard, health_damage_max,
  CONVERT(VARCHAR(10), simulation_date, 23) AS simulation_date,
  streak_factor, streak_cap,
  neglect_factor, neglect_cap,
  advanced_mode, reward_formula, todo_reward_formula, streak_bonus_formula,
  todo_bonus_enabled, todo_bonus_daily_chance, todo_bonus_multiplier, todo_bonus_age_bias,
  forced_todo_bonus_id,
  digest_enabled,
  CONVERT(VARCHAR(5), digest_time, 108) AS digest_time,
  CONVERT(VARCHAR(10), digest_last_sent_date, 23) AS digest_last_sent_date,
  bonus_notif_enabled,
  CONVERT(VARCHAR(5), bonus_notif_time, 108) AS bonus_notif_time,
  CONVERT(VARCHAR(10), bonus_notif_last_sent_date, 23) AS bonus_notif_last_sent_date,
  bonus_notif_always,
  reminders_enabled,
  retro_completion_enabled, retro_completion_multiplier, retro_lookback_days,
  all_dailies_bonus_enabled, all_dailies_bonus_amount,
  CONVERT(VARCHAR(10), all_dailies_bonus_last_awarded_date, 23) AS all_dailies_bonus_last_awarded_date,
  gamble_week_start_day,
  ts_created, ts_modified`;

const SETTINGS_OUTPUT_COLUMNS = `INSERTED.user_id,
  INSERTED.factor_easy, INSERTED.factor_medium, INSERTED.factor_hard, INSERTED.factor_max,
  INSERTED.damage_factor,
  INSERTED.coin_damage_easy, INSERTED.coin_damage_medium, INSERTED.coin_damage_hard, INSERTED.coin_damage_max,
  INSERTED.health_damage_easy, INSERTED.health_damage_medium, INSERTED.health_damage_hard, INSERTED.health_damage_max,
  CONVERT(VARCHAR(10), INSERTED.simulation_date, 23) AS simulation_date,
  INSERTED.streak_factor, INSERTED.streak_cap,
  INSERTED.neglect_factor, INSERTED.neglect_cap,
  INSERTED.advanced_mode, INSERTED.reward_formula, INSERTED.todo_reward_formula, INSERTED.streak_bonus_formula,
  INSERTED.todo_bonus_enabled, INSERTED.todo_bonus_daily_chance, INSERTED.todo_bonus_multiplier, INSERTED.todo_bonus_age_bias,
  INSERTED.digest_enabled,
  CONVERT(VARCHAR(5), INSERTED.digest_time, 108) AS digest_time,
  CONVERT(VARCHAR(10), INSERTED.digest_last_sent_date, 23) AS digest_last_sent_date,
  INSERTED.bonus_notif_enabled,
  CONVERT(VARCHAR(5), INSERTED.bonus_notif_time, 108) AS bonus_notif_time,
  CONVERT(VARCHAR(10), INSERTED.bonus_notif_last_sent_date, 23) AS bonus_notif_last_sent_date,
  INSERTED.bonus_notif_always,
  INSERTED.reminders_enabled,
  INSERTED.retro_completion_enabled, INSERTED.retro_completion_multiplier, INSERTED.retro_lookback_days,
  INSERTED.all_dailies_bonus_enabled, INSERTED.all_dailies_bonus_amount,
  CONVERT(VARCHAR(10), INSERTED.all_dailies_bonus_last_awarded_date, 23) AS all_dailies_bonus_last_awarded_date,
  INSERTED.gamble_week_start_day,
  INSERTED.ts_created, INSERTED.ts_modified`;

export async function getSettings(userId: string): Promise<QuestSettings | null> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<QuestSettings>(
      `SELECT ${SETTINGS_COLUMNS} FROM quest_settings WHERE user_id = @userId`
    );
  return result.recordset[0] ?? null;
}

export async function getFactors(userId: string): Promise<QuestFactors> {
  const settings = await getSettings(userId);
  return settings ? settingsToFactors(settings) : { ...DEFAULT_FACTORS };
}

export async function getDamageFactor(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? Number(settings.damage_factor) : DEFAULT_DAMAGE_FACTOR;
}

export async function getCoinDamage(userId: string): Promise<DifficultyMap> {
  const settings = await getSettings(userId);
  return settings ? settingsToCoinDamage(settings) : { ...DEFAULT_COIN_DAMAGE };
}

export async function getHealthDamage(userId: string): Promise<DifficultyMap> {
  const settings = await getSettings(userId);
  return settings ? settingsToHealthDamage(settings) : { ...DEFAULT_HEALTH_DAMAGE };
}

export async function getStreakFactor(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? Number(settings.streak_factor) : DEFAULT_STREAK_FACTOR;
}

export async function getStreakCap(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? Number(settings.streak_cap) : DEFAULT_STREAK_CAP;
}

export async function getNeglectFactor(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? Number(settings.neglect_factor) : DEFAULT_NEGLECT_FACTOR;
}

export async function getNeglectCap(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? Number(settings.neglect_cap) : DEFAULT_NEGLECT_CAP;
}

export interface AdvancedMode {
  enabled: boolean;
  // DB column `reward_formula` is repurposed as the DAILY reward formula in the split-formula design.
  dailyRewardFormula: string | null;
  todoRewardFormula: string | null;
  // DB column `streak_bonus_formula` is repurposed as the unified DAMAGE formula (legacy name).
  damageFormula: string | null;
}

export async function getForcedTodoBonusId(userId: string): Promise<string | null> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ forced_todo_bonus_id: string | null }>(
      `SELECT forced_todo_bonus_id FROM quest_settings WHERE user_id = @userId`
    );
  return res.recordset[0]?.forced_todo_bonus_id ?? null;
}

// Sets (or clears with null) the manual debug override of which todo gets today's bonus. We use
// a one-row MERGE on quest_settings so the override survives even when no row exists yet.
export async function setForcedTodoBonusId(userId: string, taskId: string | null): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('forcedId', sql.UniqueIdentifier, taskId)
    .query(
      `MERGE INTO quest_settings AS dest
       USING (SELECT @userId AS user_id) AS source
       ON dest.user_id = source.user_id
       WHEN MATCHED THEN UPDATE SET forced_todo_bonus_id = @forcedId, ts_modified = GETDATE()
       WHEN NOT MATCHED THEN INSERT (user_id, forced_todo_bonus_id) VALUES (@userId, @forcedId);`
    );
}

export async function getTodoBonusConfig(userId: string): Promise<TodoBonusConfig> {
  const settings = await getSettings(userId);
  if (!settings) {
    return {
      enabled: DEFAULT_TODO_BONUS_ENABLED,
      dailyChance: DEFAULT_TODO_BONUS_DAILY_CHANCE,
      multiplier: DEFAULT_TODO_BONUS_MULTIPLIER,
      ageBias: DEFAULT_TODO_BONUS_AGE_BIAS,
    };
  }
  return {
    enabled: Boolean(settings.todo_bonus_enabled),
    dailyChance: Number(settings.todo_bonus_daily_chance),
    multiplier: Number(settings.todo_bonus_multiplier),
    ageBias: Number(settings.todo_bonus_age_bias),
  };
}

// Weekday the user's quest week starts on (0 = Sunday ... 6 = Saturday) — the boundary the
// short-rest price escalation resets on. Falls back to Monday when the user has no settings row.
export async function getGambleWeekStartDay(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  return settings ? normalizeWeekStartDay(settings.gamble_week_start_day) : DEFAULT_GAMBLE_WEEK_START_DAY;
}

export async function getAdvancedMode(userId: string): Promise<AdvancedMode> {
  const settings = await getSettings(userId);
  if (!settings) return { enabled: false, dailyRewardFormula: null, todoRewardFormula: null, damageFormula: null };
  return {
    enabled: Boolean(settings.advanced_mode),
    dailyRewardFormula: settings.reward_formula ?? null,
    todoRewardFormula: settings.todo_reward_formula ?? null,
    damageFormula: settings.streak_bonus_formula ?? null,
  };
}

export async function getCurrentDate(userId: string): Promise<string> {
  const settings = await getSettings(userId);
  if (settings?.simulation_date) return settings.simulation_date;
  // Local-timezone YYYY-MM-DD (depends on Node process TZ, set via system timedatectl).
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface UpsertSettingsInput {
  factors: QuestFactors;
  damageFactor: number;
  coinDamage: DifficultyMap;
  healthDamage: DifficultyMap;
  simulationDate: string | null;
  streakFactor: number;
  streakCap: number;
  neglectFactor: number;
  neglectCap: number;
  advancedMode: boolean;
  dailyRewardFormula: string | null;
  todoRewardFormula: string | null;
  damageFormula: string | null;
  todoBonusEnabled: boolean;
  todoBonusDailyChance: number;
  todoBonusMultiplier: number;
  todoBonusAgeBias: number;
  digestEnabled: boolean;
  // HH:MM (24h, local clock). Seconds are dropped because the scheduler ticks per-minute.
  digestTime: string;
  bonusNotifEnabled: boolean;
  bonusNotifTime: string;
  bonusNotifAlways: boolean;
  remindersEnabled: boolean;
  retroCompletionEnabled: boolean;
  retroCompletionMultiplier: number;
  retroLookbackDays: number;
  allDailiesBonusEnabled: boolean;
  allDailiesBonusAmount: number;
  gambleWeekStartDay: number;
}

// Retroactive daily-completion config. enabled gates the feature, multiplier is the fraction of
// coins paid for a late completion (0..1), lookbackDays bounds how far back a daily may be
// retro-completed. Read by completeTask to price + bound backdated completions.
export interface RetroConfig {
  enabled: boolean;
  multiplier: number;
  lookbackDays: number;
}

export async function getRetroConfig(userId: string): Promise<RetroConfig> {
  const settings = await getSettings(userId);
  if (!settings) {
    return {
      enabled: DEFAULT_RETRO_COMPLETION_ENABLED,
      multiplier: DEFAULT_RETRO_COMPLETION_MULTIPLIER,
      lookbackDays: DEFAULT_RETRO_LOOKBACK_DAYS,
    };
  }
  return {
    enabled: Boolean(settings.retro_completion_enabled),
    multiplier: Number(settings.retro_completion_multiplier),
    lookbackDays: Number(settings.retro_lookback_days),
  };
}

// "All dailies complete" bonus config. enabled gates the feature, amount is the flat coin bonus
// paid once for a calendar date the moment every daily scheduled that date becomes done.
// lastAwardedDate is the idempotency stamp, read by completeTask to avoid double-paying.
export interface AllDailiesBonusConfig {
  enabled: boolean;
  amount: number;
  lastAwardedDate: string | null;
}

export async function getAllDailiesBonusConfig(userId: string): Promise<AllDailiesBonusConfig> {
  const settings = await getSettings(userId);
  if (!settings) {
    return {
      enabled: DEFAULT_ALL_DAILIES_BONUS_ENABLED,
      amount: DEFAULT_ALL_DAILIES_BONUS_AMOUNT,
      lastAwardedDate: null,
    };
  }
  return {
    enabled: Boolean(settings.all_dailies_bonus_enabled),
    amount: Number(settings.all_dailies_bonus_amount),
    lastAwardedDate: settings.all_dailies_bonus_last_awarded_date ?? null,
  };
}

// Marks todayYMD as paid so completeTask won't pay the bonus again for the same date. Called
// inside the same transaction as the payout ledger insert.
export async function markAllDailiesBonusAwarded(
  tx: sql.Transaction,
  userId: string,
  todayYMD: string,
): Promise<void> {
  await tx.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayYMD)
    .query(
      `UPDATE quest_settings SET all_dailies_bonus_last_awarded_date = @today, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export interface DigestConfig {
  enabled: boolean;
  time: string;
  lastSentDate: string | null;
}

export async function getDigestConfig(userId: string): Promise<DigestConfig> {
  const settings = await getSettings(userId);
  if (!settings) {
    return { enabled: DEFAULT_DIGEST_ENABLED, time: DEFAULT_DIGEST_TIME, lastSentDate: null };
  }
  return {
    enabled: Boolean(settings.digest_enabled),
    // Normalize stored HH:MM:SS / HH:MM to HH:MM for the UI input.
    time: (settings.digest_time ?? DEFAULT_DIGEST_TIME).slice(0, 5),
    lastSentDate: settings.digest_last_sent_date ?? null,
  };
}

// Marks today's digest as sent. Idempotent — the scheduler also gates on lastSentDate to
// avoid double-sending if it ticks twice in the same minute.
export async function markDigestSent(userId: string, todayYMD: string): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayYMD)
    .query(
      `UPDATE quest_settings SET digest_last_sent_date = @today, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

// Debug-only: clear today's dedupe stamp so the scheduler will fire again this minute (if enabled
// and time has passed). Used by the "clear sent" button on the settings page.
export async function clearDigestSent(userId: string): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(
      `UPDATE quest_settings SET digest_last_sent_date = NULL, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export async function clearBonusNotifSent(userId: string): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(
      `UPDATE quest_settings SET bonus_notif_last_sent_date = NULL, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

// Returns users with digest enabled whose scheduled time is <= the current local minute and who
// haven't received today's digest yet. Caller passes `nowHHMM` (server local clock HH:MM) and
// will compare the user's per-row simulated `today` (resolved via getCurrentDate) before sending.
export interface DigestCandidate {
  userId: string;
  email: string;
  name: string | null;
  digestTime: string;
  lastSentDate: string | null;
}

export async function listDigestCandidates(nowHHMM: string): Promise<DigestCandidate[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('nowHHMM', sql.VarChar(5), nowHHMM)
    .query<{ user_id: string; digest_time: string; digest_last_sent_date: string | null }>(
      `SELECT s.user_id,
              CONVERT(VARCHAR(5), s.digest_time, 108) AS digest_time,
              CONVERT(VARCHAR(10), s.digest_last_sent_date, 23) AS digest_last_sent_date
       FROM quest_settings s
       WHERE s.digest_enabled = 1
         AND CONVERT(VARCHAR(5), s.digest_time, 108) <= @nowHHMM`
    );
  if (res.recordset.length === 0) return [];
  const userMap = await lookupUsers(res.recordset.map((r) => r.user_id));
  return res.recordset.map((r) => ({
    userId: r.user_id,
    email: userMap.get(r.user_id)?.email ?? '',
    name: userMap.get(r.user_id)?.name ?? null,
    digestTime: r.digest_time,
    lastSentDate: r.digest_last_sent_date,
  }));
}

// Lookup user email/name from MAIN DB for a set of quest user_ids.
async function lookupUsers(userIds: string[]): Promise<Map<string, { email: string; name: string | null }>> {
  if (userIds.length === 0) return new Map();
  const mainPool = await getMainConnection();
  const req = mainPool.request();
  const params = userIds.map((id, i) => {
    req.input(`u${i}`, sql.UniqueIdentifier, id);
    return `@u${i}`;
  }).join(',');
  const res = await req.query<{ id: string; email: string; name: string | null }>(
    `SELECT id, email, name FROM users WHERE id IN (${params})`
  );
  const map = new Map<string, { email: string; name: string | null }>();
  for (const row of res.recordset) {
    map.set(row.id, { email: row.email, name: row.name });
  }
  return map;
}

export interface BonusNotifConfig {
  enabled: boolean;
  time: string;
  lastSentDate: string | null;
  always: boolean;
}

export async function getBonusNotifConfig(userId: string): Promise<BonusNotifConfig> {
  const settings = await getSettings(userId);
  if (!settings) {
    return {
      enabled: DEFAULT_BONUS_NOTIF_ENABLED,
      time: DEFAULT_BONUS_NOTIF_TIME,
      lastSentDate: null,
      always: DEFAULT_BONUS_NOTIF_ALWAYS,
    };
  }
  return {
    enabled: Boolean(settings.bonus_notif_enabled),
    time: (settings.bonus_notif_time ?? DEFAULT_BONUS_NOTIF_TIME).slice(0, 5),
    lastSentDate: settings.bonus_notif_last_sent_date ?? null,
    always: Boolean(settings.bonus_notif_always),
  };
}

export async function markBonusNotifSent(userId: string, todayYMD: string): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayYMD)
    .query(
      `UPDATE quest_settings SET bonus_notif_last_sent_date = @today, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export interface BonusNotifCandidate {
  userId: string;
  email: string;
  name: string | null;
  bonusNotifTime: string;
  lastSentDate: string | null;
  always: boolean;
}

export async function listBonusNotifCandidates(nowHHMM: string): Promise<BonusNotifCandidate[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('nowHHMM', sql.VarChar(5), nowHHMM)
    .query<{ user_id: string; bonus_notif_time: string; bonus_notif_last_sent_date: string | null; bonus_notif_always: boolean }>(
      `SELECT s.user_id,
              CONVERT(VARCHAR(5), s.bonus_notif_time, 108) AS bonus_notif_time,
              CONVERT(VARCHAR(10), s.bonus_notif_last_sent_date, 23) AS bonus_notif_last_sent_date,
              s.bonus_notif_always
       FROM quest_settings s
       WHERE s.bonus_notif_enabled = 1
         AND CONVERT(VARCHAR(5), s.bonus_notif_time, 108) <= @nowHHMM`
    );
  if (res.recordset.length === 0) return [];
  const userMap = await lookupUsers(res.recordset.map((r) => r.user_id));
  return res.recordset.map((r) => ({
    userId: r.user_id,
    email: userMap.get(r.user_id)?.email ?? '',
    name: userMap.get(r.user_id)?.name ?? null,
    bonusNotifTime: r.bonus_notif_time,
    lastSentDate: r.bonus_notif_last_sent_date,
    always: Boolean(r.bonus_notif_always),
  }));
}

export async function getCurrentBalance(userId: string): Promise<number> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ balance: number }>(
      `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WHERE user_id = @userId`
    );
  return Number(res.recordset[0]?.balance ?? 0);
}

export async function upsertSettings(userId: string, input: UpsertSettingsInput): Promise<QuestSettings> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('fEasy', sql.Decimal(6, 3), input.factors.easy)
    .input('fMed', sql.Decimal(6, 3), input.factors.medium)
    .input('fHard', sql.Decimal(6, 3), input.factors.hard)
    .input('fMax', sql.Decimal(6, 3), input.factors.max)
    .input('damage', sql.Decimal(6, 3), input.damageFactor)
    .input('cEasy', sql.Decimal(10, 2), input.coinDamage.easy)
    .input('cMed', sql.Decimal(10, 2), input.coinDamage.medium)
    .input('cHard', sql.Decimal(10, 2), input.coinDamage.hard)
    .input('cMax', sql.Decimal(10, 2), input.coinDamage.max)
    .input('hEasy', sql.Decimal(10, 2), input.healthDamage.easy)
    .input('hMed', sql.Decimal(10, 2), input.healthDamage.medium)
    .input('hHard', sql.Decimal(10, 2), input.healthDamage.hard)
    .input('hMax', sql.Decimal(10, 2), input.healthDamage.max)
    .input('simDate', sql.Date, input.simulationDate)
    .input('streakFactor', sql.Decimal(6, 3), input.streakFactor)
    .input('streakCap', sql.Int, Math.round(input.streakCap))
    .input('neglectFactor', sql.Decimal(6, 3), input.neglectFactor)
    .input('neglectCap', sql.Int, Math.round(input.neglectCap))
    .input('advancedMode', sql.Bit, input.advancedMode ? 1 : 0)
    .input('rewardFormula', sql.NVarChar(500), input.dailyRewardFormula)
    .input('todoRewardFormula', sql.NVarChar(500), input.todoRewardFormula)
    .input('streakBonusFormula', sql.NVarChar(500), input.damageFormula)
    .input('todoBonusEnabled', sql.Bit, input.todoBonusEnabled ? 1 : 0)
    .input('todoBonusDailyChance', sql.Decimal(6, 3), input.todoBonusDailyChance)
    .input('todoBonusMultiplier', sql.Decimal(6, 3), input.todoBonusMultiplier)
    .input('todoBonusAgeBias', sql.Decimal(6, 3), input.todoBonusAgeBias)
    // Append :00 so MSSQL parses the HH:MM as a valid TIME(0).
    .input('digestEnabled', sql.Bit, input.digestEnabled ? 1 : 0)
    .input('digestTime', sql.VarChar(8), `${input.digestTime}:00`)
    .input('bonusNotifEnabled', sql.Bit, input.bonusNotifEnabled ? 1 : 0)
    .input('bonusNotifTime', sql.VarChar(8), `${input.bonusNotifTime}:00`)
    .input('bonusNotifAlways', sql.Bit, input.bonusNotifAlways ? 1 : 0)
    .input('remindersEnabled', sql.Bit, input.remindersEnabled ? 1 : 0)
    .input('retroEnabled', sql.Bit, input.retroCompletionEnabled ? 1 : 0)
    .input('retroMultiplier', sql.Decimal(5, 4), input.retroCompletionMultiplier)
    .input('retroLookbackDays', sql.Int, Math.round(input.retroLookbackDays))
    .input('allDailiesBonusEnabled', sql.Bit, input.allDailiesBonusEnabled ? 1 : 0)
    .input('allDailiesBonusAmount', sql.Decimal(10, 2), input.allDailiesBonusAmount)
    .input('gambleWeekStartDay', sql.TinyInt, normalizeWeekStartDay(input.gambleWeekStartDay))
    .query<QuestSettings>(
      `MERGE INTO quest_settings AS dest
       USING (SELECT @userId AS user_id) AS source
       ON dest.user_id = source.user_id
       WHEN MATCHED THEN
         UPDATE SET factor_easy = @fEasy, factor_medium = @fMed, factor_hard = @fHard, factor_max = @fMax,
                    damage_factor = @damage,
                    coin_damage_easy = @cEasy, coin_damage_medium = @cMed, coin_damage_hard = @cHard, coin_damage_max = @cMax,
                    health_damage_easy = @hEasy, health_damage_medium = @hMed, health_damage_hard = @hHard, health_damage_max = @hMax,
                    simulation_date = @simDate,
                    streak_factor = @streakFactor, streak_cap = @streakCap,
                    neglect_factor = @neglectFactor, neglect_cap = @neglectCap,
                    advanced_mode = @advancedMode,
                    reward_formula = @rewardFormula,
                    todo_reward_formula = @todoRewardFormula,
                    streak_bonus_formula = @streakBonusFormula,
                    todo_bonus_enabled = @todoBonusEnabled,
                    todo_bonus_daily_chance = @todoBonusDailyChance,
                    todo_bonus_multiplier = @todoBonusMultiplier,
                    todo_bonus_age_bias = @todoBonusAgeBias,
                    digest_enabled = @digestEnabled,
                    digest_time = @digestTime,
                    bonus_notif_enabled = @bonusNotifEnabled,
                    bonus_notif_time = @bonusNotifTime,
                    bonus_notif_always = @bonusNotifAlways,
                    reminders_enabled = @remindersEnabled,
                    retro_completion_enabled = @retroEnabled,
                    retro_completion_multiplier = @retroMultiplier,
                    retro_lookback_days = @retroLookbackDays,
                    all_dailies_bonus_enabled = @allDailiesBonusEnabled,
                    all_dailies_bonus_amount = @allDailiesBonusAmount,
                    gamble_week_start_day = @gambleWeekStartDay,
                    ts_modified = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, factor_easy, factor_medium, factor_hard, factor_max,
                 damage_factor,
                 coin_damage_easy, coin_damage_medium, coin_damage_hard, coin_damage_max,
                 health_damage_easy, health_damage_medium, health_damage_hard, health_damage_max,
                 simulation_date,
                 streak_factor, streak_cap,
                 neglect_factor, neglect_cap,
                 advanced_mode, reward_formula, todo_reward_formula, streak_bonus_formula,
                 todo_bonus_enabled, todo_bonus_daily_chance, todo_bonus_multiplier, todo_bonus_age_bias,
                 digest_enabled, digest_time,
                 bonus_notif_enabled, bonus_notif_time, bonus_notif_always,
                 reminders_enabled,
                 retro_completion_enabled, retro_completion_multiplier, retro_lookback_days,
                 all_dailies_bonus_enabled, all_dailies_bonus_amount,
                 gamble_week_start_day)
         VALUES (@userId, @fEasy, @fMed, @fHard, @fMax,
                 @damage,
                 @cEasy, @cMed, @cHard, @cMax,
                 @hEasy, @hMed, @hHard, @hMax,
                 @simDate,
                 @streakFactor, @streakCap,
                 @neglectFactor, @neglectCap,
                 @advancedMode, @rewardFormula, @todoRewardFormula, @streakBonusFormula,
                 @todoBonusEnabled, @todoBonusDailyChance, @todoBonusMultiplier, @todoBonusAgeBias,
                 @digestEnabled, @digestTime,
                 @bonusNotifEnabled, @bonusNotifTime, @bonusNotifAlways,
                 @remindersEnabled,
                 @retroEnabled, @retroMultiplier, @retroLookbackDays,
                 @allDailiesBonusEnabled, @allDailiesBonusAmount,
                 @gambleWeekStartDay)
       OUTPUT ${SETTINGS_OUTPUT_COLUMNS};`
    );
  if (result.recordset.length === 0) {
    throw new Error(`Failed to upsert quest settings for user id: '${userId}'`);
  }
  return result.recordset[0];
}
