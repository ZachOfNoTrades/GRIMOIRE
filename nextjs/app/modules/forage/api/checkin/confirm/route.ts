import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { applyCheckIn, MacroValues } from '../../../lib/checkinFunctions';

// Read the expected macro set from a parsed body, treating anything but four finite numbers as not supplied
function readExpectedMacros(body: unknown): MacroValues | null {
  const expected = (body as { expected?: Partial<MacroValues> } | null)?.expected;
  if (!expected) return null;
  const { kcal, protein_g, carbs_g, fat_g } = expected;
  const values = [kcal, protein_g, carbs_g, fat_g];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { kcal: kcal!, protein_g: protein_g!, carbs_g: carbs_g!, fat_g: fat_g! };
}

// Complete a due check-in through applyCheckIn, answering 409 with its reason when it does not apply
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await request.json().catch(() => null); // No or malformed body from a scripted call
    const isKeepingCurrent = (body as { keep_current?: unknown } | null)?.keep_current === true; // Complete the check-in without new targets
    const result = await applyCheckIn(session.user.id!, readExpectedMacros(body), isKeepingCurrent);
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
