import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { importMacroFactorData } from '../../lib/importFunctions';
import { ImportPayload } from '../../types/import';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const sessionEmail = (session.user.email ?? '').toLowerCase();

    const body: ImportPayload = await request.json();

    if (!body || !Array.isArray(body.foods) || !Array.isArray(body.entries)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    if (body.user_email && body.user_email.toLowerCase() !== sessionEmail) {
      return NextResponse.json(
        { error: `Payload user_email '${body.user_email}' does not match session '${sessionEmail}'` },
        { status: 400 }
      );
    }

    const result = await importMacroFactorData(userId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /modules/forage/api/import:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Import failed' },
      { status: 500 }
    );
  }
}
