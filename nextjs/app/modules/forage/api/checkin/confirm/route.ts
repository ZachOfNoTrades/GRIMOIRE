import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { applyCheckIn, MacroValues } from '../../../lib/checkinFunctions';

// Reads the optional `expected` macro set out of the request body — what the
// wizard's diff slide was showing when the user hit Confirm. A body is optional
// (and may be absent or malformed for a non-browser caller), so anything that
// isn't a complete, finite macro set is treated as "not supplied".
async function readExpectedMacros(request: NextRequest): Promise<MacroValues | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null; // no/!JSON body — legacy client or a scripted call
  }
  const expected = (body as { expected?: Partial<MacroValues> } | null)?.expected;
  if (!expected) return null;
  const { kcal, protein_g, carbs_g, fat_g } = expected;
  const values = [kcal, protein_g, carbs_g, fat_g];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { kcal: kcal!, protein_g: protein_g!, carbs_g: carbs_g!, fat_g: fat_g! };
}

// The explicit "confirm" action for the check-in wizard — this is the ONLY
// place a weekly check-in recompute happens now (replaces the old silent
// GET /api/program auto-trigger). Re-validates due-state server-side as
// defense-in-depth against a stale client, and refuses to apply a recompute
// that no longer matches the numbers the wizard displayed (reason
// 'stale_preview', with the fresh numbers attached for a re-confirm).
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const expected = await readExpectedMacros(request);
    const result = await applyCheckIn(session.user.id!, expected);
    if (!result.applied) {
      return NextResponse.json(
        { error: 'Check-in not applicable', reason: result.reason, proposed: result.proposed ?? null },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, target: result.target, previous: result.previous ?? null });
  } catch (error) {
    console.error('Error in POST /forage/api/checkin/confirm:', error);
    return NextResponse.json({ error: 'Failed to complete check-in' }, { status: 500 });
  }
}
