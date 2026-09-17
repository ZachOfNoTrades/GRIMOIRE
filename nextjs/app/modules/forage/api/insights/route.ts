import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getLatestWeightLb, listWeights } from '../../lib/weightFunctions';
import { getActiveProgram } from '../../lib/programFunctions';
import { getActiveGoal } from '../../lib/goalFunctions';
import { getNutrientDailySeries } from '../../lib/entryFunctions';
import { listKcalTargetsByDate } from '../../lib/targetFunctions';
import { estimateExpenditure } from '../../lib/expenditure';
import { FLOOR_MIN_KCAL, todayIsoLocal } from '../../lib/program';
import { TrainingKind } from '../../types/program';
import { InsightsPayload } from '../../types/insights';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Longest range served, in days. Matches the widest preset the insight pages
// offer (1Y) with slack for a leap year; the daily expenditure series re-runs the
// whole estimator per day, so this is also what bounds that cost.
const MAX_RANGE_DAYS = 370;

// How far before the range weigh-ins are fetched. The trend weight is an
// exponentially-smoothed series (ui/home/weightTrend), so a range that starts
// with no history behind it would open on the raw first reading instead of a
// settled trend. 30 days is several EMA spans.
const WEIGHT_LEAD_DAYS = 30;

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Everything the dashboard's insight detail pages (expenditure, weight trend,
// energy balance, goal) read for one date range, in one round trip, so the four
// pages share a payload shape and one per-range cache.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id!;

  const startDate = request.nextUrl.searchParams.get('startDate') ?? '';
  const endDate = request.nextUrl.searchParams.get('endDate') ?? '';
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || startDate > endDate) {
    return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD with startDate <= endDate' }, { status: 400 });
  }
  if (dayDiff(startDate, endDate) + 1 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range must be at most ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  try {
    const today = todayIsoLocal();
    const [latestWeightLb, program, goal] = await Promise.all([
      getLatestWeightLb(userId),
      getActiveProgram(userId),
      getActiveGoal(userId),
    ]);
    const trainingKind: TrainingKind = (program?.training_kind as TrainingKind) ?? 'none';

    // Weigh-ins reach back before the range for the trend's lead-in, and before
    // the goal's start so the goal page can read its baseline.
    const goalStart = goal ? goal.created_at.slice(0, 10) : startDate;
    const weightSince = shiftIso(goalStart < startDate ? goalStart : startDate, -WEIGHT_LEAD_DAYS);

    // The daily expenditure series always ends today (it is the estimate as it
    // stood on each day); it only needs to reach back to the range start.
    const seriesDays = Math.min(MAX_RANGE_DAYS, Math.max(1, dayDiff(startDate, today) + 1));

    const [intake, weighIns, expenditure, targets] = await Promise.all([
      getNutrientDailySeries(userId, 'kcal', startDate, endDate),
      listWeights(userId, weightSince),
      estimateExpenditure(userId, { trainingKind, latestWeightLb, dailySeriesDays: seriesDays }),
      listKcalTargetsByDate(userId, startDate, endDate),
    ]);

    const payload: InsightsPayload = {
      start_date: startDate,
      end_date: endDate,
      intake,
      weigh_ins: [...weighIns].sort((a, b) => a.log_date.localeCompare(b.log_date)),
      expenditure: {
        ...expenditure,
        floor_kcal: FLOOR_MIN_KCAL[program?.floor_kind ?? 'standard'],
        latest_weight_lb: latestWeightLb,
        daily: expenditure.daily.filter((p) => p.date >= startDate && p.date <= endDate),
      },
      targets,
      goal,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error in GET /forage/api/insights:', error);
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 });
  }
}
