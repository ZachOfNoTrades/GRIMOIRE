import { NextResponse } from 'next/server';
import { getCardsByDeckId } from '../../../../lib/cardFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cards = await getCardsByDeckId(id);
    return NextResponse.json(cards);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]/cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cards' },
      { status: 500 }
    );
  }
}
