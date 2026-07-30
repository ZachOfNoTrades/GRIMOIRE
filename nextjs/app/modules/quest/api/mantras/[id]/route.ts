import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { updateMantra, deleteMantra } from '../../../lib/mantraFunctions';
import { MANTRA_MAX_LENGTH } from '../../../types/mantra';

// The mssql driver throws on a non-GUID UNIQUEIDENTIFIER parameter, which would surface as a 500.
// A path id that isn't a GUID can never match a row, so treat it as a plain 404.
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!GUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    const text = (body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    if (text.length > MANTRA_MAX_LENGTH) {
      return NextResponse.json({ error: `Text must be ${MANTRA_MAX_LENGTH} characters or fewer` }, { status: 400 });
    }
    const mantra = await updateMantra(session.user.id!, id, text);
    if (!mantra) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(mantra);
  } catch (error) {
    console.error('Error in PUT /quest/api/mantras/[id]:', error);
    return NextResponse.json({ error: 'Failed to update mantra' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!GUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const ok = await deleteMantra(session.user.id!, id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /quest/api/mantras/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete mantra' }, { status: 500 });
  }
}
