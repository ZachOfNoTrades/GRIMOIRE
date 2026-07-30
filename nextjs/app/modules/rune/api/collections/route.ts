import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getAllCollections, createCollection } from '../../lib/collectionFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const collections = await getAllCollections(userId!);
    return NextResponse.json(collections);

  } catch (error) {
    console.error('Error in GET /api/collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { name, description, deckIds } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const collection = await createCollection(
      userId!,
      name,
      description || null,
      Array.isArray(deckIds) ? deckIds : []
    );
    return NextResponse.json(collection, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/collections:', error);

    // Name is unique per user — surface the clash instead of a blank 500.
    if (error instanceof Error && error.message.includes('UQ_collections_user_name')) {
      return NextResponse.json(
        { error: 'A collection with that name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}
