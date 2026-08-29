import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  getSettings,
  getFactors,
  getDamageFactor,
  getCoinDamage,
  getHealthDamage,
  getStreakFactor,
  getStreakCap,
  getNeglectFactor,
  getNeglectCap,
  getAdvancedMode,
  getTodoBonusConfig,
  getDigestConfig,
  getBonusNotifConfig,
  getAllDailiesBonusConfig,
  getGambleWeekStartDay,
  upsertSettings,
} from '../../lib/settingsFunctions';
import { DIFFICULTY_ORDER, Difficulty } from '../../types/task';
import {
  QuestFactors,
  DifficultyMap,
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
  DEFAULT_REMINDERS_ENABLED,
  DEFAULT_RETRO_COMPLETION_ENABLED,
  DEFAULT_RETRO_COMPLETION_MULTIPLIER,
  DEFAULT_RETRO_LOOKBACK_DAYS,
  DEFAULT_ALL_DAILIES_BONUS_ENABLED,
  DEFAULT_ALL_DAILIES_BONUS_AMOUNT,
} from '../../types/settings';
import { validateFormula } from '../../lib/formulaEvaluator';
import { DEFAULT_GAMBLE_WEEK_START_DAY, normalizeWeekStartDay } from '../../lib/gambleConfig';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const userId = session.user.id!;
    const [factors, damageFactor, coinDamage, healthDamage, streakFactor, streakCap, neglectFactor, neglectCap, advanced, bonus, digest, bonusNotif, allDailiesBonus, gambleWeekStartDay, settings] = await Promise.all([
      getFactors(userId),
      getDamageFactor(userId),
      getCoinDamage(userId),
      getHealthDamage(userId),
      getStreakFactor(userId),
      getStreakCap(userId),
      getNeglectFactor(userId),
      getNeglectCap(userId),
      getAdvancedMode(userId),
      getTodoBonusConfig(userId),
      getDigestConfig(userId),
      getBonusNotifConfig(userId),
      getAllDailiesBonusConfig(userId),
      getGambleWeekStartDay(userId),
      getSettings(userId),
    ]);
    return NextResponse.json({
      factors,
      damageFactor,
      coinDamage,
      healthDamage,
      streakFactor,
      streakCap,
      neglectFactor,
      neglectCap,
      advancedMode: advanced.enabled,
      dailyRewardFormula: advanced.dailyRewardFormula,
      todoRewardFormula: advanced.todoRewardFormula,
      damageFormula: advanced.damageFormula,
      todoBonusEnabled: bonus.enabled,
      todoBonusDailyChance: bonus.dailyChance,
      todoBonusMultiplier: bonus.multiplier,
      todoBonusAgeBias: bonus.ageBias,
      digestEnabled: digest.enabled,
      digestTime: digest.time,
      digestLastSentDate: digest.lastSentDate,
      bonusNotifEnabled: bonusNotif.enabled,
      bonusNotifTime: bonusNotif.time,
      bonusNotifLastSentDate: bonusNotif.lastSentDate,
      bonusNotifAlways: bonusNotif.always,
      remindersEnabled: settings ? Boolean(settings.reminders_enabled) : DEFAULT_REMINDERS_ENABLED,
      retroCompletionEnabled: settings ? Boolean(settings.retro_completion_enabled) : DEFAULT_RETRO_COMPLETION_ENABLED,
      retroCompletionMultiplier: settings ? Number(settings.retro_completion_multiplier) : DEFAULT_RETRO_COMPLETION_MULTIPLIER,
      retroLookbackDays: settings ? Number(settings.retro_lookback_days) : DEFAULT_RETRO_LOOKBACK_DAYS,
      allDailiesBonusEnabled: allDailiesBonus.enabled,
      allDailiesBonusAmount: allDailiesBonus.amount,
      allDailiesBonusLastAwardedDate: allDailiesBonus.lastAwardedDate,
      gambleWeekStartDay,
      simulationDate: settings?.simulation_date ?? null,
    });
  } catch (error) {
    console.error('Error in GET /quest/api/settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

function parseDifficultyMap(body: Record<string, unknown> | undefined, key: string, fallback: DifficultyMap): DifficultyMap | NextResponse {
  if (!body || body[key] === undefined) return { ...fallback };
  const raw = body[key] as Record<string, unknown>;
  const out: Partial<DifficultyMap> = {};
  for (const d of DIFFICULTY_ORDER) {
    const v = Number(raw?.[d]);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: `${key}.${d} must be a non-negative number` }, { status: 400 });
    }
    out[d as Difficulty] = v;
  }
  return out as DifficultyMap;
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const existing = await getSettings(session.user.id!);

    const parsedFactors: Partial<QuestFactors> = {};
    for (const d of DIFFICULTY_ORDER) {
      const num = Number(body?.factors?.[d]);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json({ error: `Factor for '${d}' must be a non-negative number` }, { status: 400 });
      }
      parsedFactors[d as Difficulty] = num;
    }

    let damageFactor = body?.damageFactor;
    if (damageFactor === undefined || damageFactor === null) {
      damageFactor = existing ? Number(existing.damage_factor) : DEFAULT_DAMAGE_FACTOR;
    } else {
      damageFactor = Number(damageFactor);
      if (!Number.isFinite(damageFactor) || damageFactor < 0) {
        return NextResponse.json({ error: 'Damage factor must be a non-negative number' }, { status: 400 });
      }
    }

    const coinDamageOrErr = parseDifficultyMap(body, 'coinDamage', existing ? {
      easy: Number(existing.coin_damage_easy),
      medium: Number(existing.coin_damage_medium),
      hard: Number(existing.coin_damage_hard),
      max: Number(existing.coin_damage_max),
    } : DEFAULT_COIN_DAMAGE);
    if (coinDamageOrErr instanceof NextResponse) return coinDamageOrErr;

    const healthDamageOrErr = parseDifficultyMap(body, 'healthDamage', existing ? {
      easy: Number(existing.health_damage_easy),
      medium: Number(existing.health_damage_medium),
      hard: Number(existing.health_damage_hard),
      max: Number(existing.health_damage_max),
    } : DEFAULT_HEALTH_DAMAGE);
    if (healthDamageOrErr instanceof NextResponse) return healthDamageOrErr;

    let simulationDate: string | null;
    if (body?.simulationDate === undefined) {
      simulationDate = existing?.simulation_date ?? null;
    } else if (body.simulationDate === null || body.simulationDate === '') {
      simulationDate = null;
    } else if (typeof body.simulationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.simulationDate)) {
      simulationDate = body.simulationDate;
    } else {
      return NextResponse.json({ error: 'simulationDate must be YYYY-MM-DD or null' }, { status: 400 });
    }

    let streakFactor = body?.streakFactor;
    if (streakFactor === undefined || streakFactor === null) {
      streakFactor = existing ? Number(existing.streak_factor) : DEFAULT_STREAK_FACTOR;
    } else {
      streakFactor = Number(streakFactor);
      if (!Number.isFinite(streakFactor) || streakFactor < 0) {
        return NextResponse.json({ error: 'Streak factor must be a non-negative number' }, { status: 400 });
      }
    }

    let streakCap = body?.streakCap;
    if (streakCap === undefined || streakCap === null) {
      streakCap = existing ? Number(existing.streak_cap) : DEFAULT_STREAK_CAP;
    } else {
      streakCap = Number(streakCap);
      if (!Number.isFinite(streakCap) || streakCap < 0 || !Number.isInteger(streakCap)) {
        return NextResponse.json({ error: 'Streak cap must be a non-negative integer' }, { status: 400 });
      }
    }

    let neglectFactor = body?.neglectFactor;
    if (neglectFactor === undefined || neglectFactor === null) {
      neglectFactor = existing ? Number(existing.neglect_factor) : DEFAULT_NEGLECT_FACTOR;
    } else {
      neglectFactor = Number(neglectFactor);
      if (!Number.isFinite(neglectFactor) || neglectFactor < 0) {
        return NextResponse.json({ error: 'Neglect factor must be a non-negative number' }, { status: 400 });
      }
    }

    let neglectCap = body?.neglectCap;
    if (neglectCap === undefined || neglectCap === null) {
      neglectCap = existing ? Number(existing.neglect_cap) : DEFAULT_NEGLECT_CAP;
    } else {
      neglectCap = Number(neglectCap);
      if (!Number.isFinite(neglectCap) || neglectCap < 0 || !Number.isInteger(neglectCap)) {
        return NextResponse.json({ error: 'Neglect cap must be a non-negative integer' }, { status: 400 });
      }
    }

    const advancedMode = body?.advancedMode === undefined
      ? Boolean(existing?.advanced_mode)
      : Boolean(body.advancedMode);

    let dailyRewardFormula: string | null;
    if (body?.dailyRewardFormula === undefined) {
      dailyRewardFormula = existing?.reward_formula ?? null;
    } else if (body.dailyRewardFormula === null || body.dailyRewardFormula === '') {
      dailyRewardFormula = null;
    } else if (typeof body.dailyRewardFormula === 'string') {
      if (body.dailyRewardFormula.length > 500) {
        return NextResponse.json({ error: 'dailyRewardFormula must be at most 500 characters' }, { status: 400 });
      }
      const err = validateFormula(body.dailyRewardFormula);
      if (err) return NextResponse.json({ error: `Invalid daily reward formula: ${err}` }, { status: 400 });
      dailyRewardFormula = body.dailyRewardFormula;
    } else {
      return NextResponse.json({ error: 'dailyRewardFormula must be a string or null' }, { status: 400 });
    }

    let todoRewardFormula: string | null;
    if (body?.todoRewardFormula === undefined) {
      todoRewardFormula = existing?.todo_reward_formula ?? null;
    } else if (body.todoRewardFormula === null || body.todoRewardFormula === '') {
      todoRewardFormula = null;
    } else if (typeof body.todoRewardFormula === 'string') {
      if (body.todoRewardFormula.length > 500) {
        return NextResponse.json({ error: 'todoRewardFormula must be at most 500 characters' }, { status: 400 });
      }
      const err = validateFormula(body.todoRewardFormula);
      if (err) return NextResponse.json({ error: `Invalid todo reward formula: ${err}` }, { status: 400 });
      todoRewardFormula = body.todoRewardFormula;
    } else {
      return NextResponse.json({ error: 'todoRewardFormula must be a string or null' }, { status: 400 });
    }

    let todoBonusEnabled: boolean;
    if (body?.todoBonusEnabled === undefined) {
      todoBonusEnabled = existing ? Boolean(existing.todo_bonus_enabled) : DEFAULT_TODO_BONUS_ENABLED;
    } else {
      todoBonusEnabled = Boolean(body.todoBonusEnabled);
    }

    let todoBonusDailyChance = body?.todoBonusDailyChance;
    if (todoBonusDailyChance === undefined || todoBonusDailyChance === null) {
      todoBonusDailyChance = existing ? Number(existing.todo_bonus_daily_chance) : DEFAULT_TODO_BONUS_DAILY_CHANCE;
    } else {
      todoBonusDailyChance = Number(todoBonusDailyChance);
      if (!Number.isFinite(todoBonusDailyChance) || todoBonusDailyChance < 0 || todoBonusDailyChance > 100) {
        return NextResponse.json({ error: 'todoBonusDailyChance must be a number in [0, 100]' }, { status: 400 });
      }
    }

    let todoBonusMultiplier = body?.todoBonusMultiplier;
    if (todoBonusMultiplier === undefined || todoBonusMultiplier === null) {
      todoBonusMultiplier = existing ? Number(existing.todo_bonus_multiplier) : DEFAULT_TODO_BONUS_MULTIPLIER;
    } else {
      todoBonusMultiplier = Number(todoBonusMultiplier);
      if (!Number.isFinite(todoBonusMultiplier) || todoBonusMultiplier < 0) {
        return NextResponse.json({ error: 'todoBonusMultiplier must be a non-negative number' }, { status: 400 });
      }
    }

    let todoBonusAgeBias = body?.todoBonusAgeBias;
    if (todoBonusAgeBias === undefined || todoBonusAgeBias === null) {
      todoBonusAgeBias = existing ? Number(existing.todo_bonus_age_bias) : DEFAULT_TODO_BONUS_AGE_BIAS;
    } else {
      todoBonusAgeBias = Number(todoBonusAgeBias);
      if (!Number.isFinite(todoBonusAgeBias)) {
        return NextResponse.json({ error: 'todoBonusAgeBias must be a finite number' }, { status: 400 });
      }
    }

    let digestEnabled: boolean;
    if (body?.digestEnabled === undefined) {
      digestEnabled = existing ? Boolean(existing.digest_enabled) : DEFAULT_DIGEST_ENABLED;
    } else {
      digestEnabled = Boolean(body.digestEnabled);
    }

    let digestTime: string;
    if (body?.digestTime === undefined || body.digestTime === null || body.digestTime === '') {
      // Reuse existing HH:MM:SS by trimming, else fall back to default.
      digestTime = (existing?.digest_time ? String(existing.digest_time).slice(0, 5) : DEFAULT_DIGEST_TIME);
    } else if (typeof body.digestTime === 'string' && /^\d{2}:\d{2}$/.test(body.digestTime)) {
      const [hh, mm] = body.digestTime.split(':').map((p: string) => Number(p));
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return NextResponse.json({ error: 'digestTime must be a valid HH:MM in [00:00, 23:59]' }, { status: 400 });
      }
      digestTime = body.digestTime;
    } else {
      return NextResponse.json({ error: 'digestTime must be a string of the form HH:MM' }, { status: 400 });
    }

    let bonusNotifEnabled: boolean;
    if (body?.bonusNotifEnabled === undefined) {
      bonusNotifEnabled = existing ? Boolean(existing.bonus_notif_enabled) : DEFAULT_BONUS_NOTIF_ENABLED;
    } else {
      bonusNotifEnabled = Boolean(body.bonusNotifEnabled);
    }

    let bonusNotifTime: string;
    if (body?.bonusNotifTime === undefined || body.bonusNotifTime === null || body.bonusNotifTime === '') {
      bonusNotifTime = (existing?.bonus_notif_time ? String(existing.bonus_notif_time).slice(0, 5) : DEFAULT_BONUS_NOTIF_TIME);
    } else if (typeof body.bonusNotifTime === 'string' && /^\d{2}:\d{2}$/.test(body.bonusNotifTime)) {
      const [hh, mm] = body.bonusNotifTime.split(':').map((p: string) => Number(p));
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return NextResponse.json({ error: 'bonusNotifTime must be a valid HH:MM in [00:00, 23:59]' }, { status: 400 });
      }
      bonusNotifTime = body.bonusNotifTime;
    } else {
      return NextResponse.json({ error: 'bonusNotifTime must be a string of the form HH:MM' }, { status: 400 });
    }

    let bonusNotifAlways: boolean;
    if (body?.bonusNotifAlways === undefined) {
      bonusNotifAlways = existing ? Boolean(existing.bonus_notif_always) : DEFAULT_BONUS_NOTIF_ALWAYS;
    } else {
      bonusNotifAlways = Boolean(body.bonusNotifAlways);
    }

    // Master switch for task-reminder emails; also the flag the email unsubscribe link flips.
    let remindersEnabled: boolean;
    if (body?.remindersEnabled === undefined) {
      remindersEnabled = existing ? Boolean(existing.reminders_enabled) : DEFAULT_REMINDERS_ENABLED;
    } else {
      remindersEnabled = Boolean(body.remindersEnabled);
    }

    let damageFormula: string | null;
    if (body?.damageFormula === undefined) {
      damageFormula = existing?.streak_bonus_formula ?? null;
    } else if (body.damageFormula === null || body.damageFormula === '') {
      damageFormula = null;
    } else if (typeof body.damageFormula === 'string') {
      if (body.damageFormula.length > 500) {
        return NextResponse.json({ error: 'damageFormula must be at most 500 characters' }, { status: 400 });
      }
      const err = validateFormula(body.damageFormula);
      if (err) return NextResponse.json({ error: `Invalid damage formula: ${err}` }, { status: 400 });
      damageFormula = body.damageFormula;
    } else {
      return NextResponse.json({ error: 'damageFormula must be a string or null' }, { status: 400 });
    }

    let retroCompletionEnabled: boolean;
    if (body?.retroCompletionEnabled === undefined) {
      retroCompletionEnabled = existing ? Boolean(existing.retro_completion_enabled) : DEFAULT_RETRO_COMPLETION_ENABLED;
    } else {
      retroCompletionEnabled = Boolean(body.retroCompletionEnabled);
    }

    let retroCompletionMultiplier = body?.retroCompletionMultiplier;
    if (retroCompletionMultiplier === undefined || retroCompletionMultiplier === null) {
      retroCompletionMultiplier = existing ? Number(existing.retro_completion_multiplier) : DEFAULT_RETRO_COMPLETION_MULTIPLIER;
    } else {
      retroCompletionMultiplier = Number(retroCompletionMultiplier);
      if (!Number.isFinite(retroCompletionMultiplier) || retroCompletionMultiplier < 0 || retroCompletionMultiplier > 1) {
        return NextResponse.json({ error: 'retroCompletionMultiplier must be a number in [0, 1]' }, { status: 400 });
      }
    }

    let retroLookbackDays = body?.retroLookbackDays;
    if (retroLookbackDays === undefined || retroLookbackDays === null) {
      retroLookbackDays = existing ? Number(existing.retro_lookback_days) : DEFAULT_RETRO_LOOKBACK_DAYS;
    } else {
      retroLookbackDays = Number(retroLookbackDays);
      if (!Number.isFinite(retroLookbackDays) || retroLookbackDays < 0 || !Number.isInteger(retroLookbackDays)) {
        return NextResponse.json({ error: 'retroLookbackDays must be a non-negative integer' }, { status: 400 });
      }
    }

    let allDailiesBonusEnabled: boolean;
    if (body?.allDailiesBonusEnabled === undefined) {
      allDailiesBonusEnabled = existing ? Boolean(existing.all_dailies_bonus_enabled) : DEFAULT_ALL_DAILIES_BONUS_ENABLED;
    } else {
      allDailiesBonusEnabled = Boolean(body.allDailiesBonusEnabled);
    }

    let allDailiesBonusAmount = body?.allDailiesBonusAmount;
    if (allDailiesBonusAmount === undefined || allDailiesBonusAmount === null) {
      allDailiesBonusAmount = existing ? Number(existing.all_dailies_bonus_amount) : DEFAULT_ALL_DAILIES_BONUS_AMOUNT;
    } else {
      allDailiesBonusAmount = Number(allDailiesBonusAmount);
      if (!Number.isFinite(allDailiesBonusAmount) || allDailiesBonusAmount < 0) {
        return NextResponse.json({ error: 'allDailiesBonusAmount must be a non-negative number' }, { status: 400 });
      }
    }

    // Weekday the short-rest escalation resets on. Only a number (or a non-blank numeric string, the
    // shape a form control sends) is accepted — bare Number() would quietly turn '', [1] and true
    // into a valid-looking 0 or 1.
    const rawWeekStartDay = body?.gambleWeekStartDay;
    let gambleWeekStartDay: number;
    if (rawWeekStartDay === undefined || rawWeekStartDay === null) {
      gambleWeekStartDay = existing
        ? normalizeWeekStartDay(existing.gamble_week_start_day)
        : DEFAULT_GAMBLE_WEEK_START_DAY;
    } else {
      const numeric =
        typeof rawWeekStartDay === 'number' ? rawWeekStartDay
          : typeof rawWeekStartDay === 'string' && rawWeekStartDay.trim() !== '' ? Number(rawWeekStartDay)
            : NaN;
      if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
        return NextResponse.json({ error: 'gambleWeekStartDay must be an integer 0 (Sunday) to 6 (Saturday)' }, { status: 400 });
      }
      gambleWeekStartDay = numeric;
    }

    const saved = await upsertSettings(session.user.id!, {
      factors: parsedFactors as QuestFactors,
      damageFactor,
      coinDamage: coinDamageOrErr,
      healthDamage: healthDamageOrErr,
      simulationDate,
      streakFactor,
      streakCap,
      neglectFactor,
      neglectCap,
      advancedMode,
      dailyRewardFormula,
      todoRewardFormula,
      damageFormula,
      todoBonusEnabled,
      todoBonusDailyChance,
      todoBonusMultiplier,
      todoBonusAgeBias,
      digestEnabled,
      digestTime,
      bonusNotifEnabled,
      bonusNotifTime,
      bonusNotifAlways,
      remindersEnabled,
      retroCompletionEnabled,
      retroCompletionMultiplier,
      retroLookbackDays,
      allDailiesBonusEnabled,
      allDailiesBonusAmount,
      gambleWeekStartDay,
    });

    return NextResponse.json({
      factors: {
        easy: Number(saved.factor_easy),
        medium: Number(saved.factor_medium),
        hard: Number(saved.factor_hard),
        max: Number(saved.factor_max),
      },
      damageFactor: Number(saved.damage_factor),
      coinDamage: {
        easy: Number(saved.coin_damage_easy),
        medium: Number(saved.coin_damage_medium),
        hard: Number(saved.coin_damage_hard),
        max: Number(saved.coin_damage_max),
      },
      healthDamage: {
        easy: Number(saved.health_damage_easy),
        medium: Number(saved.health_damage_medium),
        hard: Number(saved.health_damage_hard),
        max: Number(saved.health_damage_max),
      },
      simulationDate: saved.simulation_date ?? null,
      streakFactor: Number(saved.streak_factor),
      streakCap: Number(saved.streak_cap),
      neglectFactor: Number(saved.neglect_factor),
      neglectCap: Number(saved.neglect_cap),
      advancedMode: Boolean(saved.advanced_mode),
      dailyRewardFormula: saved.reward_formula ?? null,
      todoRewardFormula: saved.todo_reward_formula ?? null,
      damageFormula: saved.streak_bonus_formula ?? null,
      todoBonusEnabled: Boolean(saved.todo_bonus_enabled),
      todoBonusDailyChance: Number(saved.todo_bonus_daily_chance),
      todoBonusMultiplier: Number(saved.todo_bonus_multiplier),
      todoBonusAgeBias: Number(saved.todo_bonus_age_bias),
      digestEnabled: Boolean(saved.digest_enabled),
      digestTime: (saved.digest_time ?? DEFAULT_DIGEST_TIME).slice(0, 5),
      digestLastSentDate: saved.digest_last_sent_date ?? null,
      bonusNotifEnabled: Boolean(saved.bonus_notif_enabled),
      bonusNotifTime: (saved.bonus_notif_time ?? DEFAULT_BONUS_NOTIF_TIME).slice(0, 5),
      bonusNotifLastSentDate: saved.bonus_notif_last_sent_date ?? null,
      bonusNotifAlways: Boolean(saved.bonus_notif_always),
      remindersEnabled: Boolean(saved.reminders_enabled),
      retroCompletionEnabled: Boolean(saved.retro_completion_enabled),
      retroCompletionMultiplier: Number(saved.retro_completion_multiplier),
      retroLookbackDays: Number(saved.retro_lookback_days),
      allDailiesBonusEnabled: Boolean(saved.all_dailies_bonus_enabled),
      allDailiesBonusAmount: Number(saved.all_dailies_bonus_amount),
      allDailiesBonusLastAwardedDate: saved.all_dailies_bonus_last_awarded_date ?? null,
      gambleWeekStartDay: normalizeWeekStartDay(saved.gamble_week_start_day),
    });
  } catch (error) {
    console.error('Error in PUT /quest/api/settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
