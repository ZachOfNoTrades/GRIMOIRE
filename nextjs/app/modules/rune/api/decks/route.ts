import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getAllDecks } from '../../lib/deckFunctions';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const result = await getAllDecks(userId!);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in GET /api/decks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch decks' },
      { status: 500 }
    );
  }
}
