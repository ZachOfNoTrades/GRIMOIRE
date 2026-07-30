import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDashboardCards, setDashboardCards } from '../../lib/dashboardFunctions';
import { DashboardSection } from '../../types/dashboard';

const ALLOWED_SECTIONS: DashboardSection[] = ['nutrition'];

// Resolve the requested section, defaulting to 'nutrition' (the only section
// today). Returns null for an unrecognized ?section= so the route can 400.
function parseSection(value: string | null): DashboardSection | null {
  const section = (value ?? 'nutrition') as DashboardSection;
  return ALLOWED_SECTIONS.includes(section) ? section : null;
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const section = parseSection(request.nextUrl.searchParams.get('section'));
    if (!section) return NextResponse.json({ error: 'Unknown section' }, { status: 400 });

    const cards = await getDashboardCards(session.user.id!, section);
    return NextResponse.json({ section, cards });
  } catch (error) {
    console.error('Error in GET /forage/api/dashboard-cards:', error);
    return NextResponse.json({ error: 'Failed to load dashboard cards' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const section = parseSection(body.section ?? null);
    if (!section) return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
    if (!Array.isArray(body.cards)) {
      return NextResponse.json({ error: 'cards must be an array of card keys' }, { status: 400 });
    }

    const cards = await setDashboardCards(session.user.id!, section, body.cards);
    return NextResponse.json({ section, cards });
  } catch (error) {
    console.error('Error in PUT /forage/api/dashboard-cards:', error);
    return NextResponse.json({ error: 'Failed to save dashboard cards' }, { status: 500 });
  }
}
