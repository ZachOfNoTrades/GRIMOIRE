import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { describeFoodWithLLM } from '../../lib/quickAddLLM';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (description.length > 1000) {
    return NextResponse.json({ error: 'description too long (max 1000 chars)' }, { status: 400 });
  }

  try {
    const estimate = await describeFoodWithLLM(description);
    return NextResponse.json(estimate);
  } catch (error: any) {
    console.error('Error in POST /forage/api/quick-add-describe:', error);
    return NextResponse.json(
      { error: error?.message || 'AI describe failed' },
      { status: 500 }
    );
  }
}
