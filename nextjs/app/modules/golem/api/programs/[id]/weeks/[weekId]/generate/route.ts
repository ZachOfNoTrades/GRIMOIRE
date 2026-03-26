import { NextResponse } from 'next/server';
import { getAuthorizedSession, isAdmin } from '@/lib/permissions';
import { shouldAdminBypassLimit, checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { generateNextWeek } from '../../../../../../lib/weekGenerationFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; weekId: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limit check (admins bypass if enabled)
    const skipLimit = shouldAdminBypassLimit() && await isAdmin();
    if (!skipLimit) {
      const { allowed, count, limit } = await checkGenerationLimit(userId!);
      if (!allowed) {
        return NextResponse.json(
          { error: `Generation limit reached (${count}/${limit} in 24h)` },
          { status: 429 }
        );
      }
    }

    const { id, weekId } = await context.params;

    await generateNextWeek(userId!, id, weekId);

    await logGeneration(userId!, "/modules/golem/api/programs/weeks/generate");

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/programs/[id]/weeks/[weekId]/generate:', error);

    if (error instanceof Error && error.message.includes('No week found')) {
      return NextResponse.json(
        { error: 'Week not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate next week' },
      { status: 500 }
    );
  }
}
