import { NextResponse } from 'next/server';
import { getSegmentsAndTargets, updateSegments } from '../../../../lib/segmentFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { exercises, targets } = await getSegmentsAndTargets(id);

    return NextResponse.json({ exercises, targets });

  } catch (error) {
    console.error('Error in GET /api/sessions/[id]/exercises:', error);
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
    const exercises = await request.json();

    await updateSegments(id, exercises);

    // Return the updated segments with targets
    const { exercises: updatedSegments, targets } = await getSegmentsAndTargets(id);

    return NextResponse.json({ exercises: updatedSegments, targets });

  } catch (error) {
    console.error('Error in PUT /api/sessions/[id]/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to update session segments' },
      { status: 500 }
    );
  }
}
