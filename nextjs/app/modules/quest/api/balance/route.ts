import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getBalance, getLedger } from '../../lib/ledgerFunctions';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id!;
  try {
    const [balance, ledger] = await Promise.all([getBalance(userId), getLedger(userId, 50)]);
    return NextResponse.json({ balance, ledger });
  } catch (error) {
    console.error('Error in GET /quest/api/balance:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
