import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  getSettings,
  upsertSettings,
  upsertCheckinNotif,
  upsertFavoritesHistoryDays,
  upsertUnloggedBadge,
} from '../../lib/settingsFunctions';
import { WeightUnit, FAVORITES_HISTORY_MIN_DAYS, FAVORITES_HISTORY_MAX_DAYS } from '../../types/settings';

const ALLOWED_UNITS: WeightUnit[] = ['lbs', 'kg'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await getSettings(session.user.id!);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error in GET /forage/api/settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// Field-aware PUT: updates whichever settings groups are present in the body. The units
// page sends { weight_unit }; the check-in reminder page sends { checkin_notif_enabled,
// checkin_notif_time }; the home-badge page sends { unlogged_badge_enabled,
// unlogged_badge_time }. Returns the full, normalized settings object.
export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();

    // WEIGHT UNIT
    if (body.weight_unit !== undefined) {
      const weight_unit = body.weight_unit as WeightUnit;
      if (!ALLOWED_UNITS.includes(weight_unit)) {
        return NextResponse.json({ error: "weight_unit must be 'lbs' or 'kg'" }, { status: 400 });
      }
      await upsertSettings(session.user.id!, weight_unit);
    }

    // CHECK-IN REMINDER
    if (body.checkin_notif_enabled !== undefined || body.checkin_notif_time !== undefined) {
      const enabled = Boolean(body.checkin_notif_enabled);
      const time = typeof body.checkin_notif_time === 'string' ? body.checkin_notif_time : '09:00';
      if (!HHMM.test(time)) {
        return NextResponse.json({ error: 'checkin_notif_time must be HH:MM (24h)' }, { status: 400 });
      }
      await upsertCheckinNotif(session.user.id!, enabled, time);
    }

    // UNLOGGED-DAY DASHBOARD BADGE
    if (body.unlogged_badge_enabled !== undefined || body.unlogged_badge_time !== undefined) {
      const enabled = Boolean(body.unlogged_badge_enabled);
      const time = typeof body.unlogged_badge_time === 'string' ? body.unlogged_badge_time : '12:00';
      if (!HHMM.test(time)) {
        return NextResponse.json({ error: 'unlogged_badge_time must be HH:MM (24h)' }, { status: 400 });
      }
      await upsertUnloggedBadge(session.user.id!, enabled, time);
    }

    // FAVORITES HISTORY WINDOW
    if (body.favorites_history_days !== undefined) {
      const days = Number(body.favorites_history_days);
      if (!Number.isFinite(days) || days < FAVORITES_HISTORY_MIN_DAYS || days > FAVORITES_HISTORY_MAX_DAYS) {
        return NextResponse.json(
          { error: `favorites_history_days must be between ${FAVORITES_HISTORY_MIN_DAYS} and ${FAVORITES_HISTORY_MAX_DAYS}` },
          { status: 400 }
        );
      }
      await upsertFavoritesHistoryDays(session.user.id!, days);
    }

    const settings = await getSettings(session.user.id!);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error in PUT /forage/api/settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
