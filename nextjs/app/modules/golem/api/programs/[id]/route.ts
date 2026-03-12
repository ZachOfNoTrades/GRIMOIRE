import { NextResponse } from 'next/server';
import { getProgramById, updateProgram, archiveProgram } from '../../../lib/programFunctions';

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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { name, description } = await request.json();

    await updateProgram(id, name, description);

    // Return the updated program
    const updatedProgram = await getProgramById(id);
    return NextResponse.json(updatedProgram);

  } catch (error) {
    console.error('Error in PUT /api/programs/[id]:', error);

    if (error instanceof Error && error.message.includes('No program found')) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update program' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { is_archived } = await request.json();

    await archiveProgram(id, is_archived);

    // Return the updated program
    const updatedProgram = await getProgramById(id);
    return NextResponse.json(updatedProgram);

  } catch (error) {
    console.error('Error in PATCH /api/programs/[id]:', error);

    if (error instanceof Error && error.message.includes('No program found')) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to archive program' },
      { status: 500 }
    );
  }
}
