import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getHealthSnapshot, updateHealthProfile } from '@/lib/health/profile';
import { HealthProfileUpdate } from '@/types/health';

const SEXES = ['male', 'female', 'other', 'unspecified'];

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getHealthSnapshot(session.user.id!));
  } catch (error) {
    console.error('Error in GET /api/health/profile:', error);
    return NextResponse.json({ error: 'Failed to load health profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const updates: HealthProfileUpdate = {};

    if (body.date_of_birth !== undefined) {
      const value = body.date_of_birth || null;
      if (value && Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD' }, { status: 400 });
      }
      updates.date_of_birth = value;
    }
    if (body.biological_sex !== undefined) {
      const value = body.biological_sex || null;
      if (value && !SEXES.includes(value)) {
        return NextResponse.json({ error: `biological_sex must be one of ${SEXES.join(', ')}` }, { status: 400 });
      }
      updates.biological_sex = value;
    }
    if (body.height_cm !== undefined) {
      const value = body.height_cm === null || body.height_cm === '' ? null : Number(body.height_cm);
      if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 300)) {
        return NextResponse.json({ error: 'height_cm must be 0..300' }, { status: 400 });
      }
      updates.height_cm = value;
    }
    if (body.resting_heart_rate !== undefined) {
      const value = body.resting_heart_rate === null || body.resting_heart_rate === '' ? null : Number(body.resting_heart_rate);
      if (value !== null && (!Number.isFinite(value) || value < 20 || value > 220)) {
        return NextResponse.json({ error: 'resting_heart_rate must be 20..220' }, { status: 400 });
      }
      updates.resting_heart_rate = value;
    }
    if (body.blood_type !== undefined) updates.blood_type = body.blood_type || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.preferred_mass_unit !== undefined) {
      if (!['lb', 'kg'].includes(body.preferred_mass_unit)) {
        return NextResponse.json({ error: 'preferred_mass_unit must be lb or kg' }, { status: 400 });
      }
      updates.preferred_mass_unit = body.preferred_mass_unit;
    }
    if (body.preferred_height_unit !== undefined) {
      if (!['in', 'cm'].includes(body.preferred_height_unit)) {
        return NextResponse.json({ error: 'preferred_height_unit must be in or cm' }, { status: 400 });
      }
      updates.preferred_height_unit = body.preferred_height_unit;
    }

    await updateHealthProfile(session.user.id!, updates);
    return NextResponse.json(await getHealthSnapshot(session.user.id!));
  } catch (error) {
    console.error('Error in PUT /api/health/profile:', error);
    return NextResponse.json({ error: 'Failed to update health profile' }, { status: 500 });
  }
}
