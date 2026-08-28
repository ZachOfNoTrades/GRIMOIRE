import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { HealthConnectRecord, importRecords } from '@/lib/health/healthConnect';

// Accepts either a bare array of Health Connect records or a full export
// envelope ({ records: [...] }) — including one this app produced.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const records: HealthConnectRecord[] = Array.isArray(body) ? body : body?.records;
    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'Expected an array of records, or { records: [...] }' }, { status: 400 });
    }
    const source = typeof body?.source === 'string' ? body.source : undefined;
    return NextResponse.json(await importRecords(session.user.id!, records, source));
  } catch (error) {
    console.error('Error in POST /api/health/import:', error);
    return NextResponse.json({ error: 'Failed to import health records' }, { status: 500 });
  }
}
