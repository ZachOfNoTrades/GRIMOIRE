import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { payDebt } from '../../../../lib/debtFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await payDebt(session.user.id!, id);
    if (!result.ok && result.reason === 'not_found') {
      return NextResponse.json({ error: 'Debt not found' }, { status: 404 });
    }
    if (!result.ok && result.reason === 'no_balance') {
      return NextResponse.json({ error: 'No coins to apply', balance: result.balance }, { status: 400 });
    }
    if (!result.ok && result.reason === 'already_paid') {
      return NextResponse.json({ error: 'Debt already paid' }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/debts/[id]/pay:', error);
    return NextResponse.json({ error: 'Failed to pay debt' }, { status: 500 });
  }
}
