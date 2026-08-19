import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listUnits, createUserUnit, UnitValidationError } from '../../lib/unitFunctions';

// Every unit the caller can pick: the shared built-in catalog plus their own
// custom units, each carrying the `type` the UOM dropdowns group by.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const units = await listUnits(session.user.id!);
    return NextResponse.json(units);
  } catch (error) {
    console.error('Error in GET /forage/api/units:', error);
    return NextResponse.json({ error: 'Failed to list units' }, { status: 500 });
  }
}

// Create one custom unit for the caller. Body: { name, type? }.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const unit = await createUserUnit(session.user.id!, body?.name, body?.type ?? 'count');
    return NextResponse.json(unit, { status: 201 });
  } catch (error: any) {
    if (error instanceof UnitValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /forage/api/units:', error);
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 });
  }
}
