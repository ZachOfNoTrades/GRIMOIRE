import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listEntries, createEntry, getEntry, computeTotals } from '../../lib/entryFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });
    const entries = await listEntries(session.user.id!, date);
    const totals = computeTotals(entries);
    return NextResponse.json({ entries, totals });
  } catch (error) {
    console.error('Error in GET /forage/api/entries:', error);
    return NextResponse.json({ error: 'Failed to list entries' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const entry_date = body.entry_date as string;
    const entry_time = (body.entry_time as string | undefined) || null;
    const quantity = Number(body.quantity);
    if (!entry_date) return NextResponse.json({ error: 'entry_date required' }, { status: 400 });
    if (entry_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(entry_time))
      return NextResponse.json({ error: 'entry_time must be HH:MM or HH:MM:SS' }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0)
      return NextResponse.json({ error: 'quantity > 0 required' }, { status: 400 });
    if (!body.food_id && !body.quick_add_name) {
      return NextResponse.json({ error: 'Either food_id or quick_add_name required' }, { status: 400 });
    }
    // Optional explicit log timestamp — a multi-food plate commit sends one
    // monotonically-increasing ISO value per item so the diary keeps plate order
    // on refetch (parallel POSTs otherwise tie on the DEFAULT GETDATE()). Reject
    // an unparseable value rather than silently dropping it.
    let ts_logged: string | null = null;
    if (body.ts_logged != null) {
      const parsed = new Date(body.ts_logged);
      if (Number.isNaN(parsed.getTime()))
        return NextResponse.json({ error: 'ts_logged must be a valid date' }, { status: 400 });
      ts_logged = parsed.toISOString();
    }
    const { id } = await createEntry(session.user.id!, {
      entry_date,
      entry_time,
      quantity,
      ts_logged,
      food_id: body.food_id ?? null,
      serving_id: body.serving_id ?? null,
      quick_add_name: body.quick_add_name ?? null,
      quick_add_kcal: body.quick_add_kcal != null ? Number(body.quick_add_kcal) : null,
      quick_add_protein_g: body.quick_add_protein_g != null ? Number(body.quick_add_protein_g) : null,
      quick_add_carbs_g: body.quick_add_carbs_g != null ? Number(body.quick_add_carbs_g) : null,
      quick_add_fat_g: body.quick_add_fat_g != null ? Number(body.quick_add_fat_g) : null,
    });
    // Return the fully-hydrated entry (same shape as listEntries) so the client
    // can optimistically paint the new row without a follow-up refetch. Fall back
    // to the bare id if hydration somehow misses (the silent refresh reconciles).
    const entry = await getEntry(session.user.id!, id);
    return NextResponse.json(entry ?? { id }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/entries:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}
