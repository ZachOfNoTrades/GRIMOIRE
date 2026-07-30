import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getResolvedNutrientTargets, getNutrientOverrides } from '../../lib/nutrientTargetFunctions';

// Floor/target/ceiling per nutrient for the caller. Default mode returns the
// RESOLVED band (FDA defaults with the active program's overrides applied per
// marker) — consumed by the nutrition overview to place the bar indicators.
// `?raw=1` instead returns only the active program's RAW override rows (NULL
// markers preserved) — used by the program wizard to seed its editor.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const raw = request.nextUrl.searchParams.get('raw') === '1';
  try {
    const data = raw
      ? await getNutrientOverrides(session.user.id!)
      : await getResolvedNutrientTargets(session.user.id!);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /forage/api/nutrient-targets:', error);
    return NextResponse.json({ error: 'Failed to resolve nutrient targets' }, { status: 500 });
  }
}
