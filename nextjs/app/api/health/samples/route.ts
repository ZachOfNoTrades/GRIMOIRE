import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getLatestValues, listSamples, recordSamples } from '@/lib/health/samples';
import { HealthSampleInput } from '@/types/health';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const params = request.nextUrl.searchParams;
    const metric = params.get('metric');
    // No metric = the "latest of everything" view the health page opens on.
    if (!metric) return NextResponse.json(await getLatestValues(session.user.id!));

    return NextResponse.json(await listSamples(session.user.id!, metric, {
      since: params.get('since'),
      until: params.get('until'),
      limit: Number(params.get('limit')) || undefined,
    }));
  } catch (error) {
    console.error('Error in GET /api/health/samples:', error);
    return NextResponse.json({ error: 'Failed to list health samples' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const raw: unknown[] = Array.isArray(body) ? body : [body];
    const inputs: HealthSampleInput[] = [];

    for (const item of raw as Record<string, unknown>[]) {
      if (!item?.metric_code) {
        return NextResponse.json({ error: 'metric_code required' }, { status: 400 });
      }
      const value = Number(item.value);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: `value must be numeric for '${item.metric_code}'` }, { status: 400 });
      }
      const startAt = (item.start_at as string) || new Date().toISOString();
      if (Number.isNaN(new Date(startAt).getTime())) {
        return NextResponse.json({ error: 'start_at must be an ISO timestamp' }, { status: 400 });
      }
      inputs.push({
        metric_code: item.metric_code as string,
        value,
        unit: (item.unit as string) ?? null,
        start_at: startAt,
        end_at: (item.end_at as string) ?? null,
        source: (item.source as string) || 'manual',
        source_ref: (item.source_ref as string) ?? null,
        note: (item.note as string) ?? null,
      });
    }

    const saved = await recordSamples(session.user.id!, inputs);
    return NextResponse.json(Array.isArray(body) ? saved : saved[0], { status: 201 });
  } catch (error) {
    // An unknown metric code or unconvertible unit is a client mistake, not a
    // server fault — surface it as a 400 with the reason.
    const message = (error as Error).message ?? '';
    if (/Unknown health metric|conversion|not convertible|Invalid health sample/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Error in POST /api/health/samples:', error);
    return NextResponse.json({ error: 'Failed to record health samples' }, { status: 500 });
  }
}
