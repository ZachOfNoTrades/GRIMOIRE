import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createCollectionStudySession } from '../../../../lib/studyFunctions';
import { getCollectionById } from '../../../../lib/collectionFunctions';

export async function POST(
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

    const sessionId = await createCollectionStudySession(userId!, id);
    return NextResponse.json({ sessionId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/collections/[id]/study:', error);

    if (error instanceof Error && error.message.includes('No collection found')) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create study session' },
      { status: 500 }
    );
  }
}
