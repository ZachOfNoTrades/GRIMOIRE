import { NextResponse } from 'next/server';
import { getProgramById } from '../../../lib/programFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const program = await getProgramById(id);
    return NextResponse.json(program);

  } catch (error) {
    console.error('Error in GET /api/programs/[id]:', error);

    if (error instanceof Error && error.message.includes('No program found')) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch program' },
      { status: 500 }
    );
  }
}
