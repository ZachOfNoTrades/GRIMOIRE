import { NextResponse } from 'next/server';
import { getAuthorizedSession, isAdmin } from '@/lib/permissions';
import { shouldAdminBypassLimit, checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { generateProgramFromTemplate } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
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

    const { templateId } = await request.json();

    // Validate inputs
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    const id = await generateProgramFromTemplate(userId!, templateId);

    await logGeneration(userId!, "/modules/golem/api/programs/generate");

    return NextResponse.json({ id });

  } catch (error) {
    console.error('Error in POST /api/programs/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate program' },
      { status: 500 }
    );
  }
}
