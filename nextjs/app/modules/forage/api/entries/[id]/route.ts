import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { deleteEntry, updateEntry } from '../../../lib/entryFunctions';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await deleteEntry(session.user.id!, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/entries/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    if (body.entry_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(body.entry_time))
      return NextResponse.json({ error: 'entry_time must be HH:MM or HH:MM:SS' }, { status: 400 });
    if (body.quantity !== undefined && (!Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0))
      return NextResponse.json({ error: 'quantity > 0 required' }, { status: 400 });

    const input: any = {};
    if (body.entry_date !== undefined) input.entry_date = body.entry_date;
    if (body.entry_time !== undefined) input.entry_time = body.entry_time;
    if (body.quantity !== undefined) input.quantity = Number(body.quantity);
    if (body.food_id !== undefined) input.food_id = body.food_id;
    if (body.serving_id !== undefined) input.serving_id = body.serving_id;
    if (body.quick_add_name !== undefined) input.quick_add_name = body.quick_add_name;
    if (body.quick_add_kcal !== undefined) input.quick_add_kcal = Number(body.quick_add_kcal);
    if (body.quick_add_protein_g !== undefined) input.quick_add_protein_g = Number(body.quick_add_protein_g);
    if (body.quick_add_carbs_g !== undefined) input.quick_add_carbs_g = Number(body.quick_add_carbs_g);
    if (body.quick_add_fat_g !== undefined) input.quick_add_fat_g = Number(body.quick_add_fat_g);

    const entry = await updateEntry(session.user.id!, id, input);
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    console.error('Error in PUT /forage/api/entries/[id]:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}
