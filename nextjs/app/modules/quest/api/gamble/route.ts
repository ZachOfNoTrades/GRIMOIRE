import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { gambleForHealth } from '../../lib/userStateFunctions';

// POST /modules/quest/api/gamble — spend coins to roll a d20 and recover HP (short rest). The cost
// escalates with each roll already made this quest week, so the failure bodies carry it back for the UI.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await gambleForHealth(session.user.id!);
    if (!result.ok && result.reason === 'insufficient') {
      return NextResponse.json(
        { error: `Insufficient balance — this short rest costs ${result.cost}`, balance: result.balance, cost: result.cost, rollsThisWeek: result.rollsThisWeek },
        { status: 400 },
      );
    }
    if (!result.ok && result.reason === 'full_health') {
      return NextResponse.json(
        { error: 'Already at full health', balance: result.balance, cost: result.cost, rollsThisWeek: result.rollsThisWeek },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/gamble:', error);
    return NextResponse.json({ error: 'Failed to gamble for health' }, { status: 500 });
  }
}
