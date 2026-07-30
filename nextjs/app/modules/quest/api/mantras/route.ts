import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listMantras, createMantra } from '../../lib/mantraFunctions';
import { MANTRA_MAX_LENGTH } from '../../types/mantra';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const mantras = await listMantras(session.user.id!);
    return NextResponse.json(mantras);
  } catch (error) {
    console.error('Error in GET /quest/api/mantras:', error);
    return NextResponse.json({ error: 'Failed to list mantras' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const text = (body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    if (text.length > MANTRA_MAX_LENGTH) {
      return NextResponse.json({ error: `Text must be ${MANTRA_MAX_LENGTH} characters or fewer` }, { status: 400 });
    }
    const mantra = await createMantra(session.user.id!, text);
    return NextResponse.json(mantra, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/mantras:', error);
    return NextResponse.json({ error: 'Failed to create mantra' }, { status: 500 });
  }
}
