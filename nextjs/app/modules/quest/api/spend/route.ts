import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { spendAdhoc } from '../../lib/rewardFunctions';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const note = (body.note ?? '').toString().trim();
    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive integer' }, { status: 400 });
    }
    const result = await spendAdhoc(session.user.id!, amount, note);
    if (!result.ok && result.reason === 'insufficient') {
      return NextResponse.json({ error: 'Insufficient balance', balance: result.balance }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/spend:', error);
    return NextResponse.json({ error: 'Failed to spend' }, { status: 500 });
  }
}
