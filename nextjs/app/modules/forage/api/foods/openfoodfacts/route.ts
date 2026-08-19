import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  buildDraftFromMatch,
  fetchOpenFoodFactsProduct,
  searchOpenFoodFactsSuggestions,
} from '../../../lib/openFoodFacts';
import { listUnits } from '../../../lib/unitFunctions';

export const runtime = 'nodejs';

// How many suggestions the search lane offers. Enough to recognise the product,
// short enough that it stays a footnote under the user's own foods.
const SUGGESTION_LIMIT = 8;

// OPEN FOOD FACTS LOOKUP — the "not in your library" lane for food search, and
// the pick step that follows it. Two modes on one route because they're two
// halves of one interaction:
//   ?q=<query>  → ranked suggestions to show under an empty library search
//   ?code=<upc> → the full draft for the suggestion the user tapped
// Nothing here writes: the draft opens the create wizard pre-filled, exactly
// like a label scan, so a community record still gets eyeballed before it lands
// in the library.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  const query = searchParams.get('q')?.trim();

  try {
    // PICK — one product, fully normalized into a create-wizard draft.
    if (code) {
      const match = await fetchOpenFoodFactsProduct(code);
      if (!match) {
        return NextResponse.json({ error: "That product's nutrition couldn't be read" }, { status: 404 });
      }
      const units = await listUnits(session.user.id!);
      const knownUnits = new Set(units.map((u) => u.name.toLowerCase()));
      return NextResponse.json({
        ...buildDraftFromMatch(match, knownUnits),
        data_source: 'openfoodfacts',
        data_source_url: match.url,
        // Handed back for the create call to download server-side, rather than
        // rendered directly — the app stores photos, it never hotlinks them.
        image_url: match.image_url,
      });
    }

    // SUGGEST — a short ranked list for the query.
    if (!query) {
      return NextResponse.json({ error: 'A search term or product code is required' }, { status: 400 });
    }
    return NextResponse.json(await searchOpenFoodFactsSuggestions(query, SUGGESTION_LIMIT));
  } catch (error: any) {
    console.error('Error in GET /forage/api/foods/openfoodfacts:', error);
    return NextResponse.json({ error: 'Open Food Facts lookup failed' }, { status: 502 });
  }
}
