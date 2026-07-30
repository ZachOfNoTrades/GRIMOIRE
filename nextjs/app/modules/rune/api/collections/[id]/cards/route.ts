import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getCollectionById, getCollectionCards } from '../../../../lib/collectionFunctions';

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

    // Verify collection ownership
    await getCollectionById(userId!, id);

    const cards = await getCollectionCards(userId!, id);
    return NextResponse.json(cards);

  } catch (error) {
    console.error('Error in GET /api/collections/[id]/cards:', error);

    if (error instanceof Error && error.message.includes('No collection found')) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch cards' },
      { status: 500 }
    );
  }
}
