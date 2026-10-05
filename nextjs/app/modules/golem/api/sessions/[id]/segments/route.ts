import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getSegmentsAndTargets, updateSegments, deleteSegment } from '../../../../lib/segmentFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
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
    const session = await getAuthorizedUser(request);
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

    // Validate logged set values. The client's <input min/max> (SetTab.tsx) is not
    // enforced on direct typing or a raw API call, so bounds are re-checked here —
    // reps <= 0 / negative weight both silently corrupt SUM(reps * weight) volume
    // totals in programFunctions.ts, and RPE mirrors the app's 5-10 exertion scale.
    const invalidSet = segments
      .flatMap((s: { sets: { reps: number | null; weight: number; rpe: number | null }[] }) => s.sets)
      .find((set: { reps: number | null; weight: number; rpe: number | null }) =>
        (set.reps !== null && set.reps <= 0) ||
        set.weight < 0 ||
        (set.rpe !== null && (set.rpe < 5 || set.rpe > 10))
      );
    if (invalidSet) {
      return NextResponse.json(
        { error: 'Invalid set values: reps must be positive (or blank for timed exercises), weight cannot be negative, RPE must be between 5 and 10' },
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
    const session = await getAuthorizedUser(request);
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
