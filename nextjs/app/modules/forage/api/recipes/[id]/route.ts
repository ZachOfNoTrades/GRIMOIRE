import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getRecipe, updateRecipe, archiveRecipe } from '../../../lib/recipeFunctions';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const recipe = await getRecipe(session.user.id!, id);
    return NextResponse.json(recipe);
  } catch (error: any) {
    if (error?.message?.startsWith('No recipe found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error in GET /forage/api/recipes/[id]:', error);
    return NextResponse.json({ error: 'Failed to load recipe' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const recipe = await updateRecipe(session.user.id!, id, {
      name,
      serving_count: Number(body.serving_count ?? 1),
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : null,
      ingredients: Array.isArray(body.ingredients) ? body.ingredients : [],
    });
    return NextResponse.json(recipe);
  } catch (error: any) {
    if (error?.message?.startsWith('No recipe found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error in PUT /forage/api/recipes/[id]:', error);
    return NextResponse.json({ error: 'Failed to update recipe' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await archiveRecipe(session.user.id!, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/recipes/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 });
  }
}
