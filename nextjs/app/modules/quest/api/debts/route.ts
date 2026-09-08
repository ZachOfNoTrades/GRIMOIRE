import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listDebts, createDebt } from '../../lib/debtFunctions';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const debts = await listDebts(session.user.id!);
    return NextResponse.json(debts);
  } catch (error) {
    console.error('Error in GET /quest/api/debts:', error);
    return NextResponse.json({ error: 'Failed to list debts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    const amount = Number(body.amount);
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    // quest_debts.name is NVARCHAR(255) — reject over-length here rather than letting the
    // driver overflow the column and surface as a 500.
    if (name.length > 255) {
      return NextResponse.json({ error: 'Name must be 255 characters or fewer' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive integer' }, { status: 400 });
    }
    const debt = await createDebt(session.user.id!, name, amount);
    return NextResponse.json(debt, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/debts:', error);
    return NextResponse.json({ error: 'Failed to create debt' }, { status: 500 });
  }
}
