import { NextResponse } from 'next/server';
import { getSegmentsAndTargets, updateSegments, deleteSegment } from '../../../../lib/segmentFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { exercises, targets } = await getSegmentsAndTargets(id);

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
    const { id } = await context.params;
    const segments = await request.json();

    await updateSegments(id, segments);

    // Return the updated segments with targets
    const { exercises: updatedSegments, targets } = await getSegmentsAndTargets(id);

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
    const { id } = await context.params;
    const { segmentId, targetId } = await request.json();

    await deleteSegment(id, segmentId, targetId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/sessions/[id]/segments:', error);
    return NextResponse.json(
      { error: 'Failed to delete session segment' },
      { status: 500 }
    );
  }
}
