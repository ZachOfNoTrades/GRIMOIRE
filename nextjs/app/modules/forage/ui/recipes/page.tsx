"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import { Plus, Search, ChefHat, ChevronRight, ArrowDownUp, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Recipe } from "../../types/recipe";
import { resolveFoodIcon } from "../../lib/foodIcons";
import RecipeBuildPicker from "./RecipeBuildPicker";

type SortKey = "modified" | "name" | "kcal";

export default function ForageRecipesPage() {
  const router = useRouter();

  // DATA
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // INPUT
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("modified");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
    const q = search.trim().toLowerCase();
    let filtered = recipes;
    if (q) filtered = recipes.filter((r) => r.name.toLowerCase().includes(q));

    const sorted = [...filtered];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "kcal") sorted.sort((a, b) => b.kcal_per_serving - a.kcal_per_serving);

    return sorted;
  }, [recipes, search, sortBy]);

  // Create an empty recipe row and return it. Both "build from scratch" and the
  // photo-AI path start here; the editor disposes of it on exit if left empty.
  async function createBlankRecipe(): Promise<Recipe | null> {
    try {
      const res = await fetch(`/modules/forage/api/recipes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New recipe", serving_count: 1, ingredients: [] }),
      });
      if (!res.ok) {
        toast.error("Failed to create recipe");
        return null;
      }
      return (await res.json()) as Recipe;
    } catch {
      toast.error("Failed to create recipe");
      return null;
    }
  }

  // Build from scratch — empty editor.
  async function handleScratch() {
    const created = await createBlankRecipe();
    if (created) router.push(`/modules/forage/ui/recipes/${created.id}`);
  }

  // Import with AI — empty editor that auto-opens the photo picker (?ai=1).
  async function handleAi() {
    const created = await createBlankRecipe();
    if (created) router.push(`/modules/forage/ui/recipes/${created.id}?ai=1`);
  }

  // Import from website — server scrapes + resolves, then we open the result.
  async function handleImportUrl(url: string) {
    setIsImporting(true);
    const toastId = toast.loading("Importing recipe…");
    try {
      const res = await fetch(`/modules/forage/api/recipes/import-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Failed to import recipe", { id: toastId });
        return;
      }
      toast.success("Recipe imported", { id: toastId });
      setPickerOpen(false);
      router.push(`/modules/forage/ui/recipes/${(data as Recipe).id}`);
    } catch {
      toast.error("Failed to import recipe", { id: toastId });
    } finally {
      setIsImporting(false);
    }
  }

  function cycleSortBy() {
    setSortBy((prev) => {
      if (prev === "modified") return "name";
      if (prev === "name") return "kcal";
      return "modified";
    });
  }

  const sortLabel = sortBy === "modified" ? "Modified" : sortBy === "name" ? "Name" : "Calories";

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
            <Button className="btn-blue" onClick={() => setPickerOpen(true)} aria-label="New recipe" style={{ padding: "0.375rem 0.625rem" }}>
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
          <div style={{ position: "relative" }}>
            <Search className="w-4 h-4" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray)", pointerEvents: "none" }} />
            <input
              id="recipes-search"
              type="search"
              className="input-field"
              placeholder="Filter recipes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoCapitalize="words"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
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
              <button
                key={recipe.id}
                className="sub-card"
                onClick={() => router.push(`/modules/forage/ui/recipes/${recipe.id}`)}
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
              </button>
            );
          })}
        </div>

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>

      {/* BUILD METHOD PICKER */}
      {pickerOpen && (
        <RecipeBuildPicker
          onClose={() => setPickerOpen(false)}
          onScratch={handleScratch}
          onAi={handleAi}
          onImportUrl={handleImportUrl}
          importing={isImporting}
        />
      )}
    </div>
  );
}
