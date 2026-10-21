import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getTroubleCards } from '../../lib/troubleFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cards = await getTroubleCards({ id: session.user.id!, email: session.user.email });
    return NextResponse.json({ cards });

  } catch (error) {
    console.error('Error in GET /api/trouble:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trouble cards' },
      { status: 500 }
    );
  }
}
