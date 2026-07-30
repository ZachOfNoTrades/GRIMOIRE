import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getCollectionById, updateCollection, deleteCollection } from '../../../lib/collectionFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const collection = await getCollectionById(userId!, id);
    return NextResponse.json(collection);

  } catch (error) {
    console.error('Error in GET /api/collections/[id]:', error);

    if (error instanceof Error && error.message.includes('No collection found')) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const body = await request.json();
    const { name, description, deckIds } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // deckIds omitted entirely = leave membership untouched (rename-only edit).
    await updateCollection(
      userId!,
      id,
      name,
      description || null,
      Array.isArray(deckIds) ? deckIds : undefined
    );
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PUT /api/collections/[id]:', error);

    if (error instanceof Error && error.message.includes('No collection found')) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('UQ_collections_user_name')) {
      return NextResponse.json(
        { error: 'A collection with that name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update collection' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    await deleteCollection(userId!, id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/collections/[id]:', error);

    if (error instanceof Error && error.message.includes('No collection found')) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}
