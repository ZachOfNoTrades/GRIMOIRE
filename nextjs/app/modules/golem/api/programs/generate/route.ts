import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { generateProgramFromTemplate } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { templateId } = await request.json();

    // Validate inputs
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    const id = await generateProgramFromTemplate(userId!, templateId);

    return NextResponse.json({ id });

  } catch (error) {
    console.error('Error in POST /api/programs/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate program' },
      { status: 500 }
    );
  }
}
