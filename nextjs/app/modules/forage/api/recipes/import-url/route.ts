import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { extractRecipeFromUrl } from '../../../lib/recipeUrlLLM';
import { resolveIngredientItems } from '../../../lib/recipeIngredientResolver';
import { createRecipe } from '../../../lib/recipeFunctions';
import { RecipeIngredientInput } from '../../../types/recipe';

export const runtime = 'nodejs';
// The scrape + LLM extraction + per-ingredient nutrition lookups can run long.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'A recipe link is required' }, { status: 400 });
  }

  try {
    // Scrape + normalize (SSRF-guarded inside extractRecipeFromUrl).
    const extracted = await extractRecipeFromUrl(url.trim());

    // No ingredients usually means a block/challenge page rendered, or the link
    // isn't a recipe — don't silently create an empty recipe.
    if (extracted.ingredients.length === 0) {
      return NextResponse.json(
        { error: "Couldn't find a recipe at that link. Try a different link, or use \"Import with AI\"." },
        { status: 400 }
      );
    }

    // Resolve each normalized ingredient to a real library food (shared with
    // the photo import). The result is index-aligned to extracted.ingredients,
    // so an item the resolver couldn't map (null) keeps its original text as a
    // placeholder row instead of being silently dropped.
    const resolved = await resolveIngredientItems(userId, extracted.ingredients);

    const ingredients: RecipeIngredientInput[] = resolved.map((r, i) =>
      r
        ? { ingredient_food_id: r.food.id, serving_id: r.serving_id, quantity: r.quantity }
        : { placeholder_name: extracted.ingredients[i].name }
    );

    const recipe = await createRecipe(userId, {
      name: extracted.name,
      serving_count: extracted.serving_count,
      icon: null,
      ingredients,
    });

    return NextResponse.json(recipe, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /modules/forage/api/recipes/import-url:', error);
    // extractRecipeFromUrl throws user-safe messages (bad URL, private host,
    // timeout, no recipe found); surface them as 400 so the client can show it.
    return NextResponse.json({ error: error?.message ?? 'Import failed' }, { status: 400 });
  }
}
