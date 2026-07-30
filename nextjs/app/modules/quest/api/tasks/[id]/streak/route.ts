import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import sql from 'mssql';
import { getQuestConnection } from '../../../../lib/db';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: { count?: number; lastDate?: string | null } = {};
    if (body.streak_count !== undefined) {
      const n = Number(body.streak_count);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return NextResponse.json({ error: 'streak_count must be a non-negative integer' }, { status: 400 });
      }
      updates.count = n;
    }
    if (body.streak_last_date !== undefined) {
      if (body.streak_last_date === null || body.streak_last_date === '') {
        updates.lastDate = null;
      } else if (typeof body.streak_last_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.streak_last_date)) {
        updates.lastDate = body.streak_last_date;
      } else {
        return NextResponse.json({ error: 'streak_last_date must be YYYY-MM-DD or null' }, { status: 400 });
      }
    }
    if (updates.count === undefined && updates.lastDate === undefined) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    const pool = await getQuestConnection();
    const req = pool.request()
      .input('userId', sql.UniqueIdentifier, session.user.id!)
      .input('id', sql.UniqueIdentifier, id);
    const setParts: string[] = [];
    if (updates.count !== undefined) {
      req.input('count', sql.Int, updates.count);
      setParts.push('streak_count = @count');
    }
    if (updates.lastDate !== undefined) {
      req.input('lastDate', sql.Date, updates.lastDate);
      setParts.push('streak_last_date = @lastDate');
    }
    const res = await req.query<{ id: string }>(
      `UPDATE quest_tasks SET ${setParts.join(', ')} OUTPUT INSERTED.id WHERE id = @id AND user_id = @userId`
    );
    if (res.recordset.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH /quest/api/tasks/[id]/streak:', error);
    return NextResponse.json({ error: 'Failed to update streak' }, { status: 500 });
  }
}
