import { NextResponse } from 'next/server';
import { getAllPrograms } from '../../lib/programFunctions';

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
