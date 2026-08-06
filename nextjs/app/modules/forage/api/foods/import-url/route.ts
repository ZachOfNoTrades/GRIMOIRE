import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { extractFoodFromUrl } from '../../../lib/foodUrlLLM';
import { listUnits } from '../../../lib/unitFunctions';

export const runtime = 'nodejs';
// Scrape (+ an optional headless render of a linked nutrition page) plus the LLM
// extraction can run long — same ceiling as the recipe URL import.
export const maxDuration = 300;

// Read a food off a product / menu-item page and hand back a draft for the
// create-food form to apply. Deliberately does NOT create the food: unlike the
// recipe URL import (which builds a recipe outright), a scraped label is worth
// eyeballing before it lands in the library, and the same review step already
// exists for the nutrition-label scan.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'A product link is required' }, { status: 400 });
  }

  try {
    const units = await listUnits();
    const knownUnits = new Set(units.map((u) => u.name.toLowerCase()));
    const draft = await extractFoodFromUrl({ url: url.trim(), knownUnits });
    return NextResponse.json(draft);
  } catch (error: any) {
    console.error('Error in POST /forage/api/foods/import-url:', error);
    // extractFoodFromUrl throws user-safe messages (bad URL, private host,
    // timeout, blocked, nothing readable); surface them so the client can show it.
    return NextResponse.json({ error: error?.message ?? 'Import failed' }, { status: 400 });
  }
}
