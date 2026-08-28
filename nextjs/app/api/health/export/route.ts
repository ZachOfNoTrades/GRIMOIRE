import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { buildExport } from '@/lib/health/healthConnect';

// Google Health Connect-compatible export of the whole master store. Served as
// a file download so it can be handed straight to an importer.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const params = request.nextUrl.searchParams;
    const payload = await buildExport(session.user.id!, {
      since: params.get('since'),
      until: params.get('until'),
    });
    const filename = `grimoire-health-${payload.exportedAt.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/health/export:', error);
    return NextResponse.json({ error: 'Failed to build health export' }, { status: 500 });
  }
}
