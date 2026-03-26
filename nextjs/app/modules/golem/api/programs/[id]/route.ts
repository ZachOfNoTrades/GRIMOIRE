import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getProgramById, updateProgram, archiveProgram, activateProgram, deleteProgram } from '../../../lib/programFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const program = await getProgramById(userId!, id);
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
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const { name, description } = await request.json();

    await updateProgram(userId!, id, name, description);

    // Return the updated program
    const updatedProgram = await getProgramById(userId!, id);
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
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const body = await request.json();

    if (body.is_archived !== undefined) {
      await archiveProgram(userId!, id, body.is_archived);
    }

    if (body.is_current === true) {
      await activateProgram(userId!, id);
    }

    // Return the updated program
    const updatedProgram = await getProgramById(userId!, id);
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
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    await deleteProgram(userId!, id);
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
