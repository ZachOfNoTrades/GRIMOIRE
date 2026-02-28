import { NextResponse } from 'next/server';
import { getAllPrograms, createProgram } from '../../lib/programFunctions';
import { CreateProgramPayload } from '../../types/program';

export async function GET() {
  try {
    const programs = await getAllPrograms();
    return NextResponse.json(programs);

  } catch (error) {
    console.error('Error in GET /api/programs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch programs' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload: CreateProgramPayload = await request.json();

    const programId = await createProgram(payload);
    return NextResponse.json({ id: programId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/programs:', error);
    return NextResponse.json(
      { error: 'Failed to create program' },
      { status: 500 }
    );
  }
}
