import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  getDigestConfig,
  upsertDigestConfig,
  getSettings,
  getEvaluationPrompts,
  getDefaultEvaluationSystemPrompt,
  getDefaultEvaluationPersonalityPrompt,
  upsertEvaluationPrompts,
  getStudyPreferences,
  upsertStudyPreferences,
  countReviewsToday,
} from '../../lib/settingsFunctions';
import {
  DEFAULT_DIGEST_TIME,
  MIN_AUTO_ADVANCE_SECONDS,
  MAX_AUTO_ADVANCE_SECONDS,
  MIN_DAILY_TARGET,
  MAX_DAILY_TARGET,
} from '../../types/settings';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const digest = await getDigestConfig(session.user.id!);
    const { systemPrompt, personalityPrompt } = await getEvaluationPrompts(session.user.id!);
    const study = await getStudyPreferences(session.user.id!);
    const reviewedToday = await countReviewsToday(session.user.id!);
    return NextResponse.json({
      digestEnabled: digest.enabled,
      digestTime: digest.time,
      digestLastSentDate: digest.lastSentDate,
      evaluationSystemPrompt: systemPrompt,
      evaluationPersonalityPrompt: personalityPrompt,
      defaultEvaluationSystemPrompt: getDefaultEvaluationSystemPrompt(),
      defaultEvaluationPersonalityPrompt: getDefaultEvaluationPersonalityPrompt(),
      autoAdvanceOnEvaluate: study.autoAdvanceOnEvaluate,
      autoAdvanceSeconds: study.autoAdvanceSeconds,
      evaluationSoundEnabled: study.evaluationSoundEnabled,
      dailyGoal: study.dailyGoal,
      dailyMaxRenew: study.dailyMaxRenew,
      reviewedToday,
    });
  } catch (error) {
    console.error('Error in GET /rune/api/settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const existing = await getDigestConfig(session.user.id!);

    const digestEnabled = body?.digestEnabled === undefined
      ? existing.enabled
      : Boolean(body.digestEnabled);

    let digestTime: string;
    if (body?.digestTime === undefined || body.digestTime === null || body.digestTime === '') {
      digestTime = existing.time || DEFAULT_DIGEST_TIME;
    } else if (typeof body.digestTime === 'string' && /^\d{2}:\d{2}$/.test(body.digestTime)) {
      const [hh, mm] = body.digestTime.split(':').map((p: string) => Number(p));
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return NextResponse.json({ error: 'digestTime must be a valid HH:MM in [00:00, 23:59]' }, { status: 400 });
      }
      digestTime = body.digestTime;
    } else {
      return NextResponse.json({ error: 'digestTime must be a string of the form HH:MM' }, { status: 400 });
    }

    const saved = await upsertDigestConfig(session.user.id!, {
      enabled: digestEnabled,
      time: digestTime,
    });

    // Undefined leaves a field untouched (needs its current raw — possibly NULL —
    // value); empty/whitespace-only means "reset to default", stored as NULL.
    const existingRaw = await getSettings(session.user.id!);

    function resolvePromptField(value: unknown, currentRaw: string | null): string | null {
      if (value === undefined) return currentRaw;
      const trimmed = (value as string).trim();
      return trimmed === '' ? null : (value as string);
    }

    if (body?.evaluationSystemPrompt !== undefined && typeof body.evaluationSystemPrompt !== 'string') {
      return NextResponse.json({ error: 'evaluationSystemPrompt must be a string' }, { status: 400 });
    }
    if (body?.evaluationPersonalityPrompt !== undefined && typeof body.evaluationPersonalityPrompt !== 'string') {
      return NextResponse.json({ error: 'evaluationPersonalityPrompt must be a string' }, { status: 400 });
    }

    const savedPrompts = await upsertEvaluationPrompts(session.user.id!, {
      systemPrompt: resolvePromptField(body?.evaluationSystemPrompt, existingRaw?.evaluation_system_prompt ?? null),
      personalityPrompt: resolvePromptField(body?.evaluationPersonalityPrompt, existingRaw?.evaluation_personality_prompt ?? null),
    });

    // Study-session preferences. Undefined leaves a field untouched (falls back to
    // the current stored value / default).
    const existingStudy = await getStudyPreferences(session.user.id!);

    if (body?.autoAdvanceOnEvaluate !== undefined && typeof body.autoAdvanceOnEvaluate !== 'boolean') {
      return NextResponse.json({ error: 'autoAdvanceOnEvaluate must be a boolean' }, { status: 400 });
    }
    if (body?.evaluationSoundEnabled !== undefined && typeof body.evaluationSoundEnabled !== 'boolean') {
      return NextResponse.json({ error: 'evaluationSoundEnabled must be a boolean' }, { status: 400 });
    }
    let autoAdvanceSeconds = existingStudy.autoAdvanceSeconds;
    if (body?.autoAdvanceSeconds !== undefined) {
      const parsed = Number(body.autoAdvanceSeconds);
      if (!Number.isInteger(parsed) || parsed < MIN_AUTO_ADVANCE_SECONDS || parsed > MAX_AUTO_ADVANCE_SECONDS) {
        return NextResponse.json(
          { error: `autoAdvanceSeconds must be an integer in [${MIN_AUTO_ADVANCE_SECONDS}, ${MAX_AUTO_ADVANCE_SECONDS}]` },
          { status: 400 },
        );
      }
      autoAdvanceSeconds = parsed;
    }

    // Soft daily targets. Undefined leaves a field untouched; otherwise validate
    // as an integer within the shared [MIN_DAILY_TARGET, MAX_DAILY_TARGET] bounds.
    let dailyGoal = existingStudy.dailyGoal;
    if (body?.dailyGoal !== undefined) {
      const parsed = Number(body.dailyGoal);
      if (!Number.isInteger(parsed) || parsed < MIN_DAILY_TARGET || parsed > MAX_DAILY_TARGET) {
        return NextResponse.json(
          { error: `dailyGoal must be an integer in [${MIN_DAILY_TARGET}, ${MAX_DAILY_TARGET}]` },
          { status: 400 },
        );
      }
      dailyGoal = parsed;
    }

    let dailyMaxRenew = existingStudy.dailyMaxRenew;
    if (body?.dailyMaxRenew !== undefined) {
      const parsed = Number(body.dailyMaxRenew);
      if (!Number.isInteger(parsed) || parsed < MIN_DAILY_TARGET || parsed > MAX_DAILY_TARGET) {
        return NextResponse.json(
          { error: `dailyMaxRenew must be an integer in [${MIN_DAILY_TARGET}, ${MAX_DAILY_TARGET}]` },
          { status: 400 },
        );
      }
      dailyMaxRenew = parsed;
    }

    const savedStudy = await upsertStudyPreferences(session.user.id!, {
      autoAdvanceOnEvaluate: body?.autoAdvanceOnEvaluate === undefined ? existingStudy.autoAdvanceOnEvaluate : Boolean(body.autoAdvanceOnEvaluate),
      autoAdvanceSeconds,
      evaluationSoundEnabled: body?.evaluationSoundEnabled === undefined ? existingStudy.evaluationSoundEnabled : Boolean(body.evaluationSoundEnabled),
      dailyGoal,
      dailyMaxRenew,
    });

    return NextResponse.json({
      digestEnabled: Boolean(saved.digest_enabled),
      digestTime: (saved.digest_time ?? DEFAULT_DIGEST_TIME).slice(0, 5),
      digestLastSentDate: saved.digest_last_sent_date ?? null,
      evaluationSystemPrompt: savedPrompts.systemPrompt,
      evaluationPersonalityPrompt: savedPrompts.personalityPrompt,
      defaultEvaluationSystemPrompt: getDefaultEvaluationSystemPrompt(),
      defaultEvaluationPersonalityPrompt: getDefaultEvaluationPersonalityPrompt(),
      autoAdvanceOnEvaluate: savedStudy.autoAdvanceOnEvaluate,
      autoAdvanceSeconds: savedStudy.autoAdvanceSeconds,
      evaluationSoundEnabled: savedStudy.evaluationSoundEnabled,
      dailyGoal: savedStudy.dailyGoal,
      dailyMaxRenew: savedStudy.dailyMaxRenew,
    });
  } catch (error) {
    console.error('Error in PUT /rune/api/settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
