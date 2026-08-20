"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Recipe } from "../../types/recipe";
import { RECIPE_NAME_MAX } from "../../lib/recipeConstants";

/* ─── useRecipeBuilder ───
   The one "how do I start a recipe?" flow, shared by every surface that offers
   it — the Recipes page, the (+) Shortcuts sheet, and the food logger's Recipes
   tab. It owns the build-method picker's open state, the blank-recipe POST all
   three methods start from, and the hand-off into the recipe editor, so the
   entry points can't drift apart (they were three near-identical copies).

   `onNavigate` fires immediately before the editor route push — hosts that live
   inside a modal (the food logger) use it to close themselves first. */
export function useRecipeBuilder({ onNavigate }: { onNavigate?: () => void } = {}) {
  const router = useRouter();

  // STATE — the build-method picker, plus the URL import's in-flight flag (the
  // scrape + resolve runs server-side and takes a while, so the picker stays up
  // and disabled rather than closing on tap).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // Guards the blank-recipe POST. Without it a double-tap on any "start a
  // recipe" control (they're all one tap from a network round-trip, then a route
  // change) creates two rows and only navigates to the second, orphaning the first.
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);

  // Leave for the editor, letting the host tear itself down first.
  function openEditor(id: string, query = "") {
    onNavigate?.();
    router.push(`/modules/forage/ui/recipes/${id}${query}`);
  }

  // Create an empty recipe row and return it. Every build method starts here;
  // the editor disposes of the row on exit if it's left untouched.
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

  // Build from scratch — empty editor. `seedName` pre-fills the name field (the
  // logger's "no recipes match" shortcut passes the search text), handed over as
  // ?name= rather than saved, so an abandoned draft is still auto-disposed.
  async function startScratch(seedName?: string) {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const created = await createBlankRecipe();
      if (!created) return;
      // Clip to the column's limit — the seed comes from a free-text search box,
              // so a pasted paragraph would otherwise arrive as a name the API rejects.
              const seed = seedName?.trim().slice(0, RECIPE_NAME_MAX);
      openEditor(created.id, seed ? `?name=${encodeURIComponent(seed)}` : "");
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }

  // Import with AI — empty editor that auto-opens the photo picker (?ai=1).
  async function startAi() {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const created = await createBlankRecipe();
      if (created) openEditor(created.id, "?ai=1");
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }

  // Import from website — server scrapes + resolves, then we open the result.
  async function importFromUrl(url: string) {
    if (isImporting) return;
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
      openEditor((data as Recipe).id);
    } catch {
      toast.error("Failed to import recipe", { id: toastId });
    } finally {
      setIsImporting(false);
    }
  }

  return {
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    // True while a blank recipe is being created — callers disable their trigger.
    isStarting,
    startScratch,
    // Spread straight onto <RecipeBuildPicker> — the three methods plus close.
    pickerProps: {
      onClose: () => setPickerOpen(false),
      onScratch: () => startScratch(),
      onAi: startAi,
      onImportUrl: importFromUrl,
      importing: isImporting,
      busy: isStarting,
    },
  };
}
