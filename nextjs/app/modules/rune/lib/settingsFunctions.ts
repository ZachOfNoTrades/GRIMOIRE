import sql from 'mssql';
import { getRuneConnection } from './db';
import { getMainConnection } from '@/lib/db';
import { loadPromptFile } from './promptLoader';
import {
  RuneSettings,
  DEFAULT_DIGEST_ENABLED,
  DEFAULT_DIGEST_TIME,
  DEFAULT_AUTO_ADVANCE_ON_EVALUATE,
  DEFAULT_AUTO_ADVANCE_SECONDS,
  DEFAULT_EVALUATION_SOUND_ENABLED,
  DEFAULT_DAILY_GOAL,
  DEFAULT_DAILY_MAX_RENEW,
} from '../types/settings';

export async function getSettings(userId: string): Promise<RuneSettings | null> {
  const pool = await getRuneConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<RuneSettings>(
      `SELECT user_id,
              digest_enabled,
              CONVERT(VARCHAR(5), digest_time, 108) AS digest_time,
              CONVERT(VARCHAR(10), digest_last_sent_date, 23) AS digest_last_sent_date,
              evaluation_system_prompt,
              evaluation_personality_prompt,
              auto_advance_on_evaluate,
              auto_advance_seconds,
              evaluation_sound_enabled,
              daily_goal,
              daily_max_renew,
              ts_created,
              ts_modified
       FROM rune_settings WHERE user_id = @userId`
    );
  return res.recordset[0] ?? null;
}

// Bundled templates used when a user hasn't customized their evaluation prompts.
export function getDefaultEvaluationSystemPrompt(): string {
  return loadPromptFile('evaluateAnswerSystem.md');
}

export function getDefaultEvaluationPersonalityPrompt(): string {
  return loadPromptFile('evaluateAnswerPersonality.md');
}

export interface EvaluationPrompts {
  systemPrompt: string;
  personalityPrompt: string;
}

export async function getEvaluationPrompts(userId: string): Promise<EvaluationPrompts> {
  const settings = await getSettings(userId);
  return {
    systemPrompt: settings?.evaluation_system_prompt || getDefaultEvaluationSystemPrompt(),
    personalityPrompt: settings?.evaluation_personality_prompt || getDefaultEvaluationPersonalityPrompt(),
  };
}

export interface UpsertEvaluationPromptsInput {
  systemPrompt: string | null;
  personalityPrompt: string | null;
}

export async function upsertEvaluationPrompts(userId: string, input: UpsertEvaluationPromptsInput): Promise<EvaluationPrompts> {
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('systemPrompt', sql.NVarChar(sql.MAX), input.systemPrompt)
    .input('personalityPrompt', sql.NVarChar(sql.MAX), input.personalityPrompt)
    .query<{ evaluation_system_prompt: string | null; evaluation_personality_prompt: string | null }>(
      `MERGE INTO rune_settings AS dest
       USING (SELECT @userId AS user_id) AS src
         ON dest.user_id = src.user_id
       WHEN MATCHED THEN
         UPDATE SET evaluation_system_prompt = @systemPrompt,
                    evaluation_personality_prompt = @personalityPrompt,
                    ts_modified = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, evaluation_system_prompt, evaluation_personality_prompt)
         VALUES (@userId, @systemPrompt, @personalityPrompt)
       OUTPUT inserted.evaluation_system_prompt, inserted.evaluation_personality_prompt;`
    );
  const row = result.recordset[0];
  return {
    systemPrompt: row.evaluation_system_prompt || getDefaultEvaluationSystemPrompt(),
    personalityPrompt: row.evaluation_personality_prompt || getDefaultEvaluationPersonalityPrompt(),
  };
}

export interface StudyPreferences {
  autoAdvanceOnEvaluate: boolean;
  autoAdvanceSeconds: number;
  evaluationSoundEnabled: boolean;
  // Soft daily targets — a progress goal and a soft ceiling. Neither caps the queue.
  dailyGoal: number;
  dailyMaxRenew: number;
}

export async function getStudyPreferences(userId: string): Promise<StudyPreferences> {
  const settings = await getSettings(userId);
  if (!settings) {
    return {
      autoAdvanceOnEvaluate: DEFAULT_AUTO_ADVANCE_ON_EVALUATE,
      autoAdvanceSeconds: DEFAULT_AUTO_ADVANCE_SECONDS,
      evaluationSoundEnabled: DEFAULT_EVALUATION_SOUND_ENABLED,
      dailyGoal: DEFAULT_DAILY_GOAL,
      dailyMaxRenew: DEFAULT_DAILY_MAX_RENEW,
    };
  }
  return {
    autoAdvanceOnEvaluate: Boolean(settings.auto_advance_on_evaluate),
    autoAdvanceSeconds: settings.auto_advance_seconds ?? DEFAULT_AUTO_ADVANCE_SECONDS,
    evaluationSoundEnabled: Boolean(settings.evaluation_sound_enabled),
    dailyGoal: settings.daily_goal ?? DEFAULT_DAILY_GOAL,
    dailyMaxRenew: settings.daily_max_renew ?? DEFAULT_DAILY_MAX_RENEW,
  };
}

export async function upsertStudyPreferences(userId: string, input: StudyPreferences): Promise<StudyPreferences> {
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('autoAdvance', sql.Bit, input.autoAdvanceOnEvaluate)
    .input('autoAdvanceSeconds', sql.Int, input.autoAdvanceSeconds)
    .input('soundEnabled', sql.Bit, input.evaluationSoundEnabled)
    .input('dailyGoal', sql.Int, input.dailyGoal)
    .input('dailyMaxRenew', sql.Int, input.dailyMaxRenew)
    .query<{ auto_advance_on_evaluate: boolean; auto_advance_seconds: number; evaluation_sound_enabled: boolean; daily_goal: number | null; daily_max_renew: number | null }>(
      `MERGE INTO rune_settings AS dest
       USING (SELECT @userId AS user_id) AS src
         ON dest.user_id = src.user_id
       WHEN MATCHED THEN
         UPDATE SET auto_advance_on_evaluate = @autoAdvance,
                    auto_advance_seconds = @autoAdvanceSeconds,
                    evaluation_sound_enabled = @soundEnabled,
                    daily_goal = @dailyGoal,
                    daily_max_renew = @dailyMaxRenew,
                    ts_modified = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, auto_advance_on_evaluate, auto_advance_seconds, evaluation_sound_enabled, daily_goal, daily_max_renew)
         VALUES (@userId, @autoAdvance, @autoAdvanceSeconds, @soundEnabled, @dailyGoal, @dailyMaxRenew)
       OUTPUT inserted.auto_advance_on_evaluate,
              inserted.auto_advance_seconds,
              inserted.evaluation_sound_enabled,
              inserted.daily_goal,
              inserted.daily_max_renew;`
    );
  const row = result.recordset[0];
  return {
    autoAdvanceOnEvaluate: Boolean(row.auto_advance_on_evaluate),
    autoAdvanceSeconds: row.auto_advance_seconds ?? DEFAULT_AUTO_ADVANCE_SECONDS,
    evaluationSoundEnabled: Boolean(row.evaluation_sound_enabled),
    dailyGoal: row.daily_goal ?? DEFAULT_DAILY_GOAL,
    dailyMaxRenew: row.daily_max_renew ?? DEFAULT_DAILY_MAX_RENEW,
  };
}

// Count how many cards the user has reviewed *today* (server-local calendar day).
// Used to drive the soft daily-goal progress indicator and the max-renew warning.
// Counts distinct cards so rating the same card twice in a session isn't double-counted.
export async function countReviewsToday(userId: string): Promise<number> {
  const pool = await getRuneConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ reviewed_today: number }>(
      `SELECT COUNT(DISTINCT card_id) AS reviewed_today
       FROM card_reviews
       WHERE user_id = @userId AND created_at >= CAST(GETDATE() AS DATE)`
    );
  return Number(res.recordset[0]?.reviewed_today ?? 0);
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
    time: (settings.digest_time ?? DEFAULT_DIGEST_TIME).slice(0, 5),
    lastSentDate: settings.digest_last_sent_date ?? null,
  };
}

export interface UpsertDigestInput {
  enabled: boolean;
  time: string;
}

export async function upsertDigestConfig(userId: string, input: UpsertDigestInput): Promise<RuneSettings> {
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('enabled', sql.Bit, input.enabled)
    .input('time', sql.VarChar(8), `${input.time}:00`)
    .query<RuneSettings>(
      `MERGE INTO rune_settings AS dest
       USING (SELECT @userId AS user_id) AS src
         ON dest.user_id = src.user_id
       WHEN MATCHED THEN
         UPDATE SET digest_enabled = @enabled,
                    digest_time = @time,
                    ts_modified = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, digest_enabled, digest_time)
         VALUES (@userId, @enabled, @time)
       OUTPUT inserted.user_id,
              inserted.digest_enabled,
              CONVERT(VARCHAR(5), inserted.digest_time, 108) AS digest_time,
              CONVERT(VARCHAR(10), inserted.digest_last_sent_date, 23) AS digest_last_sent_date,
              inserted.ts_created,
              inserted.ts_modified;`
    );
  return result.recordset[0];
}

export async function markDigestSent(userId: string, todayYMD: string): Promise<void> {
  const pool = await getRuneConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayYMD)
    .query(
      `UPDATE rune_settings SET digest_last_sent_date = @today, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export async function clearDigestSent(userId: string): Promise<void> {
  const pool = await getRuneConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(
      `UPDATE rune_settings SET digest_last_sent_date = NULL, ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export interface DigestCandidate {
  userId: string;
  email: string;
  name: string | null;
  digestTime: string;
  lastSentDate: string | null;
}

export async function listDigestCandidates(nowHHMM: string): Promise<DigestCandidate[]> {
  const pool = await getRuneConnection();
  const res = await pool.request()
    .input('nowHHMM', sql.VarChar(5), nowHHMM)
    .query<{ user_id: string; digest_time: string; digest_last_sent_date: string | null }>(
      `SELECT s.user_id,
              CONVERT(VARCHAR(5), s.digest_time, 108) AS digest_time,
              CONVERT(VARCHAR(10), s.digest_last_sent_date, 23) AS digest_last_sent_date
       FROM rune_settings s
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

// Lookup user email/name from MAIN DB for a set of rune user_ids. Cross-DB join is done in JS
// because the MAIN DB name is env-configurable (no fixed three-part names).
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
