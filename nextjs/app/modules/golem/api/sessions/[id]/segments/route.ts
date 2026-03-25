import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getSegmentsAndTargets, updateSegments, deleteSegment } from '../../../../lib/segmentFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const { exercises, targets } = await getSegmentsAndTargets(userId!, id);

    return NextResponse.json({ exercises, targets });

  } catch (error) {
    console.error('Error in GET /api/sessions/[id]/segments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session segments' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const segments = await request.json();

    // Validate warmup segments have no working sets
    const invalidWarmupSegment = segments.find(
      (s: { is_warmup: boolean; sets: { is_warmup: boolean }[] }) =>
        s.is_warmup && s.sets.some((set: { is_warmup: boolean }) => !set.is_warmup)
    );
    if (invalidWarmupSegment) {
      return NextResponse.json(
        { error: 'Warmup exercises cannot contain working sets' },
        { status: 400 }
      );
    }

    await updateSegments(userId!, id, segments);

    // Return the updated segments with targets
    const { exercises: updatedSegments, targets } = await getSegmentsAndTargets(userId!, id);

    return NextResponse.json({ exercises: updatedSegments, targets });

  } catch (error) {
    console.error('Error in PUT /api/sessions/[id]/segments:', error);
    return NextResponse.json(
      { error: 'Failed to update session segments' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const { segmentId, targetId } = await request.json();

    await deleteSegment(userId!, id, segmentId, targetId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/sessions/[id]/segments:', error);
    return NextResponse.json(
      { error: 'Failed to delete session segment' },
      { status: 500 }
    );
  }
}
