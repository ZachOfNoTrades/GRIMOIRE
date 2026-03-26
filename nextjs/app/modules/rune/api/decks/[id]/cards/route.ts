import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getCardsByDeckId } from '../../../../lib/cardFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const cards = await getCardsByDeckId(userId!, id);
    return NextResponse.json(cards);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]/cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cards' },
      { status: 500 }
    );
  }
}
