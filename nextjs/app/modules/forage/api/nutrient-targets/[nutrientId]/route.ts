import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { upsertNutrientTarget, deleteNutrientTarget, NO_ACTIVE_PROGRAM } from '../../../lib/nutrientTargetFunctions';

// Parse one band marker from the request body: undefined/null/'' → null (no
// marker), otherwise a finite, non-negative number. Returns the sentinel NaN on
// an invalid value so the caller can 400.
function parseMarker(v: unknown): number | null | typeof NaN {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

// Set or update the caller's MANUAL floor/target/ceiling override for one
// nutrient. Body: { floor, target, ceiling } — each a number, or null/omitted
// for "no marker". An all-null band is a valid override (suppresses the FDA
// defaults); DELETE to fall back to the defaults instead.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ nutrientId: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { nutrientId } = await params;
  try {
    const body = await request.json();
    const floor = parseMarker(body.floor);
    const target = parseMarker(body.target);
    const ceiling = parseMarker(body.ceiling);
    if (Number.isNaN(floor) || Number.isNaN(target) || Number.isNaN(ceiling)) {
      return NextResponse.json({ error: 'floor, target and ceiling must be non-negative numbers' }, { status: 400 });
    }
    // Band must read low→high where the relevant markers are present.
    if (floor != null && ceiling != null && floor > ceiling) {
      return NextResponse.json({ error: 'floor cannot exceed ceiling' }, { status: 400 });
    }
    if (floor != null && target != null && floor > target) {
      return NextResponse.json({ error: 'floor cannot exceed target' }, { status: 400 });
    }
    if (target != null && ceiling != null && target > ceiling) {
      return NextResponse.json({ error: 'target cannot exceed ceiling' }, { status: 400 });
    }
    const resolved = await upsertNutrientTarget(session.user.id!, nutrientId, {
      floor: floor as number | null,
      target: target as number | null,
      ceiling: ceiling as number | null,
    });
    return NextResponse.json(resolved);
  } catch (error: any) {
    if (error?.message?.startsWith('No nutrient found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message === NO_ACTIVE_PROGRAM) {
      return NextResponse.json({ error: 'No active program — set up a program first' }, { status: 409 });
    }
    console.error('Error in PUT /forage/api/nutrient-targets/[nutrientId]:', error);
    return NextResponse.json({ error: 'Failed to save nutrient target' }, { status: 500 });
  }
}

// Remove the caller's manual override for one nutrient — its band reverts to the
// FDA defaults. Returns the resolved (default) band.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ nutrientId: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { nutrientId } = await params;
  try {
    const resolved = await deleteNutrientTarget(session.user.id!, nutrientId);
    return NextResponse.json(resolved);
  } catch (error: any) {
    if (error?.message?.startsWith('No nutrient found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error in DELETE /forage/api/nutrient-targets/[nutrientId]:', error);
    return NextResponse.json({ error: 'Failed to reset nutrient target' }, { status: 500 });
  }
}
