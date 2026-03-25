import { NextResponse } from 'next/server';
import { getAllDecks } from '../../lib/deckFunctions';

export async function GET() {
  try {
    const result = await getAllDecks();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in GET /api/decks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch decks' },
      { status: 500 }
    );
  }
}
