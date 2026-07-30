import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getAuthorizedUser } from '@/lib/permissions';
import { identifyRecipePhoto } from '../../lib/recipePhotoLLM';
import { resolveIngredientItems } from '../../lib/recipeIngredientResolver';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id!;

  const formData = await request.formData();
  const file = formData.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image field is required' }, { status: 400 });
  }

  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const ext = file.name.split('.').pop() || 'png';
  const imagePath = join(tmpDir, `recipe-photo-${randomUUID()}.${ext}`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(imagePath, buffer);

    const items = await identifyRecipePhoto(imagePath);
    if (items.length === 0) {
      return NextResponse.json({ ingredients: [] });
    }

    // Shared name -> library-food resolution (same path the web import uses).
    // The resolver returns an input-aligned array with nulls for failures; the
    // photo flow only surfaces successes.
    const ingredients = (await resolveIngredientItems(userId, items)).filter(Boolean);

    return NextResponse.json({ ingredients });
  } catch (error: any) {
    console.error('Error in POST /forage/api/recipe-photo:', error);
    return NextResponse.json({ error: error?.message || 'Failed to process photo' }, { status: 500 });
  } finally {
    try { unlinkSync(imagePath); } catch {}
  }
}
