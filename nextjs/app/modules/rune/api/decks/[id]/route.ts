import { NextResponse } from 'next/server';
import { getDeckById } from '../../../lib/deckFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deck = await getDeckById(id);
    return NextResponse.json(deck);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch deck' },
      { status: 500 }
    );
  }
}
