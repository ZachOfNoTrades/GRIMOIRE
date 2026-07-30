import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getMantraOfDay } from '../../../lib/mantraFunctions';

// Returns the single mantra to show for the user's effective today (honours simulation_date).
// `mantra` is null when the user hasn't added any — not an error.
export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const mantraOfDay = await getMantraOfDay(session.user.id!);
    return NextResponse.json(mantraOfDay);
  } catch (error) {
    console.error('Error in GET /quest/api/mantras/today:', error);
    return NextResponse.json({ error: 'Failed to load mantra of the day' }, { status: 500 });
  }
}
