import { NextResponse } from 'next/server';
import { getProgramById, updateProgram, archiveProgram, activateProgram, deleteProgram } from '../../../lib/programFunctions';

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
    const body = await request.json();

    if (body.is_archived !== undefined) {
      await archiveProgram(id, body.is_archived);
    }

    if (body.is_current === true) {
      await activateProgram(id);
    }

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
      { error: 'Failed to update program' },
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

    await deleteProgram(id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/programs/[id]:', error);

    if (error instanceof Error && error.message.includes('No program found')) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('Cannot delete')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete program' },
      { status: 500 }
    );
  }
}
