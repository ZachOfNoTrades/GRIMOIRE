import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getActiveProgram } from '../../lib/programFunctions';
import { isCheckInDue } from '../../lib/program';

// Read-only weekly check-in status for the active coached program. Drives the
// Strategy tab's "due" indicator dot, shown on every forage screen. Unlike
// GET /api/program, this deliberately does NOT run the lazy recompute — merely
// painting the indicator must never mark the check-in as done. Mirrors the
// dashboard SSR's due computation in ui/home/page.tsx.

// Server-local today (yyyy-mm-dd). Matches the SSR helper; the forage check-in
// math is otherwise UTC but the single-user homelab server clock tracks the user.
function todayIsoLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Read-only — getActiveProgram returns null when the user has no active
    // program yet, which simply reads as "nothing due".
    const program = await getActiveProgram(session.user.id!);
    // Only coached programs have a weekly check-in; manual programs never do.
    const due =
      !!program &&
      program.program_style === 'coached' &&
      program.check_in_weekday != null &&
      isCheckInDue(program.check_in_weekday, program.last_checkin_date, todayIsoLocal());
    return NextResponse.json({ due, weekday: program?.check_in_weekday ?? null });
  } catch (error) {
    console.error('Error in GET /forage/api/checkin-status:', error);
    return NextResponse.json({ error: 'Failed to load check-in status' }, { status: 500 });
  }
}
