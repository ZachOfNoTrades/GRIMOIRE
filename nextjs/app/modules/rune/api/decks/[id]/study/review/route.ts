import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { submitCardReview, completeStudySession } from '../../../../../lib/studyFunctions';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { cardId, studySessionId, rating, responseTimeMs } = body;

    if (!cardId || !studySessionId) {
      return NextResponse.json(
        { error: 'cardId and studySessionId are required' },
        { status: 400 }
      );
    }

    if (!rating || rating < 1 || rating > 4) {
      return NextResponse.json(
        { error: 'Rating must be 1-4' },
        { status: 400 }
      );
    }

    await submitCardReview(userId!, cardId, studySessionId, rating, responseTimeMs || null);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/decks/[id]/study/review:', error);
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { studySessionId, durationSeconds } = body;

    if (!studySessionId) {
      return NextResponse.json(
        { error: 'studySessionId is required' },
        { status: 400 }
      );
    }

    await completeStudySession(userId!, studySessionId, durationSeconds || 0);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PUT /api/decks/[id]/study/review:', error);
    return NextResponse.json(
      { error: 'Failed to complete session' },
      { status: 500 }
    );
  }
}
