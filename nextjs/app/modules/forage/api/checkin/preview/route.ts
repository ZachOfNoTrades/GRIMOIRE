import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { assembleCheckInPreview } from '../../../lib/checkinFunctions';

// Read-only preview for the check-in wizard — decides which slides apply and
// supplies their content. Never mutates anything; unlike the old GET
// /api/program, merely fetching this can never mark the check-in done.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const preview = await assembleCheckInPreview(session.user.id!);
    return NextResponse.json(preview);
  } catch (error) {
    console.error('Error in GET /forage/api/checkin/preview:', error);
    return NextResponse.json({ error: 'Failed to load check-in preview' }, { status: 500 });
  }
}
