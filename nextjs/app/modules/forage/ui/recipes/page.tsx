"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Plus, ChefHat, ChevronRight, ArrowDownUp, Flame } from "lucide-react";
import { SearchField } from "@/components/SearchField";
import { Button } from "@/components/ui/button";
import { Recipe } from "../../types/recipe";
import { resolveFoodIcon } from "../../lib/foodIcons";
import { normalizeSearchTerm } from "../../lib/searchNormalize";
import RecipeBuildPicker from "./RecipeBuildPicker";
import { useRecipeBuilder } from "./useRecipeBuilder";

type SortKey = "modified" | "created" | "name" | "kcal";

// Newest-first on an ISO timestamp; rows with no timestamp sort last. Shared by
// the "Modified" and "Created" orders so both break ties the same way.
function byTimeDesc(a?: string | null, b?: string | null): number {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  const va = Number.isNaN(ta) ? -Infinity : ta;
  const vb = Number.isNaN(tb) ? -Infinity : tb;
  return vb - va;
}

export default function ForageRecipesPage() {
  // DATA
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // INPUT
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("modified");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  // Recipe creation — shared with the (+) Shortcuts sheet and the food logger's
  // Recipes tab so every entry point offers the identical build-method flow.
  const recipeBuilder = useRecipeBuilder();

  async function loadRecipes() {
    setIsLoading(true);
    try {
      const r = await fetch(`/modules/forage/api/recipes`);
      const data = await r.json();
      setRecipes(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load recipes");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRecipes();
  }, []);

  const visibleRecipes = useMemo(() => {
    // Matches the server-side recipe search (listRecipes): every whitespace token
    // must appear in the name, with punctuation stripped from both sides so
    // "bens shake" still finds "Ben & Jerry's Shake".
    const tokens = normalizeSearchTerm(search.trim().toLowerCase()).split(/\s+/).filter(Boolean);
    let filtered = recipes;
    if (tokens.length) {
      filtered = recipes.filter((r) => {
        const name = normalizeSearchTerm(r.name.toLowerCase());
        return tokens.every((token) => name.includes(token));
      });
    }

    // Every order is applied here rather than leaning on the API's order, which is
    // `last_used` — that made the "Modified" label a lie about what it sorted by.
    const sorted = [...filtered];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "kcal") sorted.sort((a, b) => b.kcal_per_serving - a.kcal_per_serving);
    else if (sortBy === "created")
      sorted.sort((a, b) => byTimeDesc(a.ts_created, b.ts_created) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => byTimeDesc(a.ts_updated, b.ts_updated) || a.name.localeCompare(b.name));

    return sorted;
  }, [recipes, search, sortBy]);

  function cycleSortBy() {
    setSortBy((prev) => {
      if (prev === "modified") return "created";
      if (prev === "created") return "name";
      if (prev === "name") return "kcal";
      return "modified";
    });
  }

  const SORT_LABELS: Record<SortKey, string> = {
    modified: "Modified",
    created: "Created",
    name: "Name",
    kcal: "Calories",
  };
  const sortLabel = SORT_LABELS[sortBy];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container" style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* HEADER ROW */}
        <div className="card-header" style={{ marginBottom: "0.75rem" }}>

          {/* TITLE GROUP */}
          <div className="flex items-center gap-2">
            <h1 className="text-page-title"><ChefHat className="w-6 h-6" /> Recipes</h1>
          </div>

          {/* SORT + NEW */}
          <div className="flex items-center gap-2">

            {/* SORT TOGGLE */}
            <button
              onClick={cycleSortBy}
              className="flex items-center gap-1 text-muted"
              style={{ fontSize: "0.75rem", background: "none", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem" }}
            >
              <ArrowDownUp className="w-3.5 h-3.5" /> {sortLabel}
            </button>

            {/* NEW RECIPE */}
            <Button className="btn-blue" onClick={recipeBuilder.openPicker} disabled={recipeBuilder.isStarting} aria-label="New recipe" style={{ padding: "0.375rem 0.625rem" }}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* SEARCH — pinned under the header rather than at the shell's bottom edge.
            The locked full-height shell is sized to --app-height, which on Firefox
            Android is 100lvh (the LARGE viewport); when that shell is anchored flush
            to the layout-viewport top, its bottom ~(lvh - dvh) px hang below the
            visible area, and nothing scrolls them back into view (the container is
            height:100% and the list owns the only scroll). A 42px input parked there
            was left all but invisible — reported as "too far down". Anchoring to the
            top instead sidesteps the whole lvh/dvh question, and matches the sibling
            food-library page's filter placement. */}
        <div className="flex flex-col gap-1" style={{ marginBottom: "0.75rem" }}>
          <SearchField
            id="recipes-search"
            value={search}
            onChange={setSearch}
            placeholder="Filter recipes"
            autoCapitalize="words"
          />
        </div>

        {/* RECIPE LIST */}
        <div className="flex flex-col" style={{ flex: 1, overflowY: "auto" }}>

          {isLoading && (
            /* LOADING */
            <div className="loading-container"><div className="loading-spinner" /></div>
          )}

          {!isLoading && visibleRecipes.length === 0 && (
            /* EMPTY STATE */
            <div className="card">
              <div className="card-content text-muted" style={{ textAlign: "center" }}>
                {recipes.length === 0
                  ? "No recipes yet. Tap + to build one."
                  : "No recipes match that search."}
              </div>
            </div>
          )}

          {!isLoading && visibleRecipes.map((recipe) => {
            const RecipeIcon = resolveFoodIcon(recipe.icon);
            return (
              /* RECIPE ROW */
              <Link
                key={recipe.id}
                className="sub-card"
                href={`/modules/forage/ui/recipes/${recipe.id}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  borderRadius: 0,
                }}
              >

                {/* ICON */}
                <RecipeIcon className="w-6 h-6" style={{ flexShrink: 0 }} />

                {/* NAME + MACRO LINE */}
                <div style={{ flex: 1, minWidth: 0 }}>

                  {/* NAME */}
                  <div className="text-primary" style={{ fontWeight: 600, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {recipe.name}
                  </div>

                  {/* MACRO LINE — MF format: 689🔥 53P 31F 54C • 1 serving */}
                  <div className="text-muted flex items-center gap-0.5" style={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", marginTop: "0.125rem" }}>
                    {Math.round(recipe.kcal_per_serving)}<Flame className="w-3 h-3" style={{ color: "var(--color-orange)" }} /> {Math.round(recipe.protein_g_per_serving)}P {Math.round(recipe.fat_g_per_serving)}F {Math.round(recipe.carbs_g_per_serving)}C • {recipe.serving_count} {recipe.serving_count === 1 ? "serving" : "servings"}
                  </div>
                </div>

                {/* CHEVRON */}
                <ChevronRight className="w-4 h-4 text-muted" style={{ flexShrink: 0 }} />
              </Link>
            );
          })}
        </div>

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>

      {/* BUILD METHOD PICKER */}
      {recipeBuilder.pickerOpen && <RecipeBuildPicker {...recipeBuilder.pickerProps} />}
    </div>
  );
}
