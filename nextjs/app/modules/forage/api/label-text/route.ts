import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { MIN_LABEL_TEXT_CHARS, parseLabelText } from '../../lib/labelTextLLM';

export const runtime = 'nodejs';

// POST — parse pasted nutrition-label TEXT into the same LabelOcrDraft the
// label photo scan returns. The text sibling of /api/label-ocr: the create-food
// wizard routes a plain-text clipboard paste here so a copied label fills the
// form exactly the way a photographed one does.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body with a text field' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  // Too little to be a label — a bad request, not a server fault. The lib throws
  // on the same condition (it is the contract for a direct caller); the route
  // pre-checks so the client gets a 400 rather than a 500 for its own input.
  if (text.trim().length < MIN_LABEL_TEXT_CHARS) {
    return NextResponse.json(
      { error: 'Not enough text to read a label from' },
      { status: 400 }
    );
  }

  try {
    const draft = await parseLabelText({ text, userId: session.user.id });
    return NextResponse.json(draft);
  } catch (error: any) {
    console.error('Error in POST /forage/api/label-text:', error);
    return NextResponse.json(
      { error: error?.message || 'Could not read that text' },
      { status: 500 }
    );
  }
}
