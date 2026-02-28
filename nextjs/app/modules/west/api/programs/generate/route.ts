import { NextResponse } from 'next/server';
import { generateProgramInBackground } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
  try {
    const { userPrompt, startDate } = await request.json();

    // Validate inputs
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'userPrompt is required' },
        { status: 400 }
      );
    }

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json(
        { error: 'startDate is required in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Fire-and-forget — generation runs in the background
    generateProgramInBackground({ userPrompt, startDate }).catch(() => {});

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
