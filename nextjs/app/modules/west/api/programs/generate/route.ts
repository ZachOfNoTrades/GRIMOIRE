import { NextResponse } from 'next/server';
import { generateProgramInBackground } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
  try {
    const { templateId } = await request.json();

    // Validate inputs
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    // Fire-and-forget — generation runs in the background
    generateProgramInBackground(templateId).catch(() => {});

    return NextResponse.json(
      { message: 'Program generation started' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in POST /api/programs/generate:', error);
    return NextResponse.json(
      { error: 'Failed to start program generation' },
      { status: 500 }
    );
  }
}
