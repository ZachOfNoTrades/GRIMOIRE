"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast, { Toaster } from "@/components/Toaster";
import { ArrowLeft, Camera, Plus, Trash2, Save, RotateCcw, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderEditButton } from "@/components/ui/HeaderEditButton";
import { selectOnFocus, blurOnEnter } from "@/lib/inputBehavior";
import Modal from "@/components/Modal";
import { Recipe, RecipeIngredient, RecipeIngredientInput } from "../../../types/recipe";
import { Food, FoodNutrient } from "../../../types/food";
import { resolveFoodIcon, FOOD_ICONS } from "../../../lib/foodIcons";
import { FoodAvatar } from "../../../components/FoodAvatar";
import { RECIPE_NAME_MAX, RECIPE_SERVINGS_MAX } from "../../../lib/recipeConstants";
import { parseAmount } from "../../../lib/format";
import { AmountField } from "../../../components/AmountField";
import { expandVirtualServings, resolveServingForSave } from "../../../lib/virtualUnits";
import { ServingUnitOptions } from "../../../components/ServingUnitOptions";
import { AddEntryModal, FoodNutrientBreakdown, MacroTiles, RecipeUsageList, useNutrients, prefetchNutrientTargets } from "../../_diary";
import UpLink from "@/components/UpLink";
import SegmentedToggle from "@/components/ui/SegmentedToggle";

// Nutrition of ONE canonical serving of an ingredient's food. Every row's
// kcal/macros/nutrients are derived from this × (quantity ÷ units_per_serving),
// so an amount edit, a unit switch, a replace and a fresh add all land on the
// same numbers the server computes on save. `nutrients` is null while the
// food's per-nutrient rows are still being fetched (picker rows carry macros only).
interface ServingBase {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrients: FoodNutrient[] | null;
}

interface DraftIngredient extends RecipeIngredient {
  __clientId: string;
  // Raw text of the quantity field while it's being edited. Lets the user clear
  // the field (showing empty rather than snapping to 0); undefined means the
  // field mirrors the numeric `quantity`. Reconciled back to a number on blur.
  __quantityText?: string;
  // null on placeholders, and on a resolved row whose base couldn't be derived
  // from the server's totals (quantity 0) until the food fetch fills it.
  __base: ServingBase | null;
}

// Serving multiplier for a row: quantity in <unit> ÷ how many <unit> make one serving.
function servingsOf(quantity: number, unitsPerServing: number | null | undefined): number {
  const ups = Number(unitsPerServing);
  if (!Number.isFinite(ups) || ups <= 0 || !Number.isFinite(quantity)) return 0;
  return quantity / ups;
}

// Re-derive a row's contribution from its serving base at its current amount + unit.
function withNutrition(row: DraftIngredient): DraftIngredient {
  const base = row.__base;
  if (!base || !row.ingredient_food_id) return row;
  const k = servingsOf(row.quantity, row.units_per_serving);
  return {
    ...row,
    kcal: base.kcal * k,
    protein_g: base.protein_g * k,
    carbs_g: base.carbs_g * k,
    fat_g: base.fat_g * k,
    nutrients: base.nutrients ? base.nutrients.map((n) => ({ nutrient_id: n.nutrient_id, amount: n.amount * k })) : [],
  };
}

function baseFromFood(food: Food): ServingBase {
  return {
    kcal: Number(food.kcal_per_serving) || 0,
    protein_g: Number(food.protein_g_per_serving) || 0,
    carbs_g: Number(food.carbs_g_per_serving) || 0,
    fat_g: Number(food.fat_g_per_serving) || 0,
    nutrients: food.nutrients ? food.nutrients.map((n) => ({ nutrient_id: n.nutrient_id, amount: Number(n.amount) || 0 })) : null,
  };
}

function newClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDraft(r: RecipeIngredient, i: number): DraftIngredient {
  // The server hydrates each row's totals at its saved amount; divide back out to
  // the per-serving base so later edits rescale from it instead of compounding ratios.
  const k = servingsOf(Number(r.quantity), r.units_per_serving);
  const base: ServingBase | null =
    r.ingredient_food_id && k > 0
      ? {
          kcal: (r.kcal ?? 0) / k,
          protein_g: (r.protein_g ?? 0) / k,
          carbs_g: (r.carbs_g ?? 0) / k,
          fat_g: (r.fat_g ?? 0) / k,
          nutrients: (r.nutrients ?? []).map((n) => ({ nutrient_id: n.nutrient_id, amount: (Number(n.amount) || 0) / k })),
        }
      : null;
  return {
    ...r,
    quantity: Number(r.quantity) || 0,
    __clientId: `${r.id}-${i}`,
    __base: base,
    // Expand the food's stored servings with the standard units of its mass/volume
    // family so the unit picker offers related units (e.g. a gram-based food → lb/oz/kg).
    food_servings: expandVirtualServings(r.ingredient_food_id ?? "", r.food_servings ?? []),
  };
}

// The persisted shape of an ingredient list, for dirty-checking the draft
// against the saved recipe (client-only fields and derived totals excluded).
function ingredientKey(rows: RecipeIngredient[]): string {
  return JSON.stringify(
    rows.map((r) => [r.ingredient_food_id, r.serving_id, Number(r.quantity), r.placeholder_name, r.placeholder_quantity_text])
  );
}

// Servings as typed → a usable yield, or null when it isn't one.
function parseServings(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) && n > 0 && n <= RECIPE_SERVINGS_MAX ? n : null;
}

export default function ForageRecipeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const recipeId = params.id;

  // DATA
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  // INPUT
  const [name, setName] = useState("");
  const [servingCount, setServingCount] = useState("1");
  const [icon, setIcon] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // View vs edit. A recipe opens read-only (view mode) so merely opening one
  // can't mutate it; the user taps Edit to make changes. Freshly-created blank
  // recipes and the AI/import flows auto-enter edit mode (set in loadRecipe).
  const [isEditing, setIsEditing] = useState(false);
  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "replace"; clientId: string }>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  // Nutrition scope toggle — mirrors MacroFactor's [Serving | Recipe] segmented control.
  const [nutritionScope, setNutritionScope] = useState<"serving" | "recipe">("serving");
  const [isScanning, setIsScanning] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Disposal bookkeeping — a freshly-created blank recipe that's left empty is
  // deleted on exit, so abandoned "New recipe" rows don't pile up.
  const aiTriggeredRef = useRef(false);
  const deletedRef = useRef(false);
  const disposeRef = useRef<{ id: string; dispose: boolean }>({ id: recipeId, dispose: false });
  // Name handed over by the opener via ?name= (the food logger seeds it with the
  // recipe search that found nothing, so the user doesn't retype it). It's a
  // draft value only — never saved on arrival — and counts as "still blank" below,
  // so backing straight out of a seeded recipe still auto-disposes the row.
  const seededNameRef = useRef<string>("");

  // A recipe is disposable only if BOTH the saved row and the current draft are
  // still the untouched blank default — no ingredients, no icon, default/blank
  // name. Gating on the saved row too means an existing recipe whose fields a
  // user merely cleared (without saving) is never auto-deleted, and imported
  // recipes (real name + ingredients) are always kept.
  function isBlank(name: string, ingredientCount: number, icon: string | null): boolean {
    const n = name.trim().toLowerCase();
    const seeded = seededNameRef.current.trim().toLowerCase();
    return ingredientCount === 0 && !icon && (n === "" || n === "new recipe" || (!!seeded && n === seeded));
  }
  function recipeIsDisposable(): boolean {
    if (!recipe) return false;
    return (
      isBlank(recipe.name, recipe.ingredients.length, recipe.icon) &&
      isBlank(name, ingredients.length, icon)
    );
  }

  async function handlePhotoUpload(file: File) {
    setIsScanning(true);
    const toastId = toast.loading("Identifying ingredients…");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/modules/forage/api/recipe-photo", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to process photo", { id: toastId });
        return;
      }
      const { ingredients } = await res.json();
      if (!Array.isArray(ingredients) || ingredients.length === 0) {
        toast("No foods identified in photo", { id: toastId });
        return;
      }
      let added = 0;
      for (const ing of ingredients) {
        const food: Food = ing.food;
        const serving = food.servings?.find((s) => s.id === ing.serving_id) ?? food.servings?.[0];
        if (!serving) continue;
        const newRow = buildRow(newClientId("photo"), food, serving.id, Number(ing.quantity) || Number(serving.units_per_serving) || 1);
        setIngredients((prev) => [...prev, newRow]);
        if (!newRow.__base?.nutrients) hydrateNutrients(newRow.__clientId, food.id);
        added++;
      }
      toast.success(`Added ${added} ingredient${added === 1 ? "" : "s"}`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Photo processing failed", { id: toastId });
    } finally {
      setIsScanning(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isScanning || !isEditing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handlePhotoUpload(file);
            return;
          }
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function loadRecipe() {
    setIsLoading(true);
    try {
      const r = await fetch(`/modules/forage/api/recipes/${recipeId}`);
      if (!r.ok) {
        toast.error("Recipe not found");
        router.push("/modules/forage/ui/recipes");
        return;
      }
      const data: Recipe = await r.json();
      setRecipe(data);
      setName(data.name);
      setServingCount(String(data.serving_count));
      setIcon(data.icon);
      setIngredients(data.ingredients.map(toDraft));
      // Auto-enter edit mode for a freshly-created blank recipe, the AI/import
      // flows (?ai=1), or an explicit edit deep-link (?edit=1, used by the diary
      // timeline's "Edit recipe" action so it lands straight in the editor) —
      // those land here expecting to build immediately. An existing recipe with
      // real content opened any other way stays read-only.
      const editParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      // ?name= pre-fills the name of a still-blank recipe (never overwrites one
      // that already has content), so a "Create \"chicken chili\"" hand-off from
      // the logger lands with the name already typed.
      const seededName = (editParams?.get("name") ?? "").trim();
      if (seededName && isBlank(data.name, data.ingredients.length, data.icon)) {
        seededNameRef.current = seededName;
        setName(seededName);
      }
      const wantsEdit =
        isBlank(data.name, data.ingredients.length, data.icon) ||
        editParams?.get("ai") === "1" ||
        editParams?.get("edit") === "1";
      setIsEditing(wantsEdit);
    } catch {
      toast.error("Failed to load recipe");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (recipeId) loadRecipe();
  }, [recipeId]);

  // Warm the resolved nutrient-target cache on mount so the micronutrient
  // breakdown has its bands ready by the time the ingredients resolve.
  useEffect(() => {
    prefetchNutrientTargets();
  }, []);

  // Import-with-AI entry (?ai=1) auto-opens the photo picker once loaded.
  useEffect(() => {
    if (isLoading || !recipe || aiTriggeredRef.current) return;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai") === "1") {
      aiTriggeredRef.current = true;
      photoInputRef.current?.click();
    }
  }, [isLoading, recipe]);

  // Keep the latest disposability + id in a ref so the unmount cleanup (below)
  // can act on fresh values regardless of which exit path the user took.
  useEffect(() => {
    disposeRef.current = { id: recipeId, dispose: recipeIsDisposable() };
  });

  // On any exit (nav drawer, browser back, route change) best-effort delete an
  // abandoned blank recipe. keepalive lets the request outlive the unmount.
  useEffect(() => {
    return () => {
      if (disposeRef.current.dispose && !deletedRef.current) {
        fetch(`/modules/forage/api/recipes/${disposeRef.current.id}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  // Back button — delete first (awaited) when the recipe is an empty blank,
  // then return to the list.
  async function goBack() {
    if (recipeIsDisposable()) {
      deletedRef.current = true;
      try {
        await fetch(`/modules/forage/api/recipes/${recipeId}`, { method: "DELETE" });
      } catch {
        // best-effort — fall through to navigation regardless
      }
    }
    router.push("/modules/forage/ui/recipes");
  }

  // Yield used for the per-serving math: the typed servings when valid, else the
  // saved count, so a half-typed field ("", "0.") never divides by ~0.
  const yieldCount = parseServings(servingCount) ?? recipe?.serving_count ?? 1;

  // Live whole-recipe totals from the resolved rows. Mirrors what the server
  // does on save — placeholders contribute 0 until resolved.
  const totals = useMemo(() => {
    let kcal = 0, protein = 0, carbs = 0, fat = 0;
    for (const row of ingredients) {
      if (!row.ingredient_food_id) continue;
      kcal += row.kcal ?? 0;
      protein += row.protein_g ?? 0;
      carbs += row.carbs_g ?? 0;
      fat += row.fat_g ?? 0;
    }
    return { kcal, protein, carbs, fat };
  }, [ingredients]);
  const scopeDivisor = nutritionScope === "serving" ? yieldCount : 1;

  // Full nutrient catalog (for the micronutrient breakdown labels/order).
  const nutrientCatalog = useNutrients();

  // Aggregate each ingredient's per-nutrient contribution into one recipe-level
  // list, scaled to the active scope (whole recipe vs per serving), so the
  // breakdown renders the shared banded bars like the food detail.
  const aggregatedNutrients = useMemo<FoodNutrient[]>(() => {
    const byId = new Map<string, number>();
    for (const row of ingredients) {
      if (!row.ingredient_food_id) continue;
      for (const nu of row.nutrients ?? []) {
        byId.set(nu.nutrient_id, (byId.get(nu.nutrient_id) ?? 0) + (Number(nu.amount) || 0));
      }
    }
    return Array.from(byId, ([nutrient_id, amount]) => ({ nutrient_id, amount: amount / scopeDivisor }));
  }, [ingredients, scopeDivisor]);

  const placeholderCount = ingredients.filter((r) => !r.ingredient_food_id).length;

  // Unsaved changes — Save stays disabled until the draft differs from the saved recipe.
  const isDirty = useMemo(() => {
    if (!recipe) return false;
    return (
      name.trim() !== recipe.name ||
      parseServings(servingCount) !== Number(recipe.serving_count) ||
      (icon ?? null) !== (recipe.icon ?? null) ||
      ingredientKey(ingredients) !== ingredientKey(recipe.ingredients)
    );
  }, [recipe, name, servingCount, icon, ingredients]);

  // Build a resolved row for `food` at `quantity` of serving `servingId`.
  function buildRow(clientId: string, food: Food, servingId: string, quantity: number): DraftIngredient {
    const servings = expandVirtualServings(food.id, food.servings ?? []);
    const serving = servings.find((s) => s.id === servingId) ?? servings[0];
    return withNutrition({
      __clientId: clientId,
      id: "",
      display_order: 0,
      ingredient_food_id: food.id,
      serving_id: serving?.id ?? null,
      quantity,
      placeholder_name: null,
      placeholder_quantity_text: null,
      food_name: food.name,
      food_brand: food.brand,
      food_icon: food.icon,
      food_image_updated_at: food.image_updated_at,
      serving_unit: serving?.unit ?? null,
      units_per_serving: serving?.units_per_serving ?? null,
      food_servings: servings,
      __base: baseFromFood(food),
    });
  }

  // Picker and photo rows arrive with macros only; fetch the food's full
  // nutrient rows so the micronutrient breakdown includes the new ingredient.
  async function hydrateNutrients(clientId: string, foodId: string) {
    try {
      const res = await fetch(`/modules/forage/api/foods/${foodId}`);
      if (!res.ok) return;
      const food: Food = await res.json();
      const base = baseFromFood(food);
      setIngredients((prev) =>
        prev.map((r) =>
          r.__clientId === clientId && r.ingredient_food_id === foodId
            ? withNutrition({ ...r, __base: { ...base, nutrients: base.nutrients ?? [] } })
            : r
        )
      );
    } catch {
      // Macros are already right; the breakdown just omits this row's micros.
    }
  }

  // A loaded row saved at quantity 0 has no totals to derive a base from.
  useEffect(() => {
    for (const row of ingredients) {
      if (row.ingredient_food_id && !row.__base) hydrateNutrients(row.__clientId, row.ingredient_food_id);
    }
    // Only on load/save — rows created in the editor always carry a base.
  }, [recipe]);

  // Patch a row and re-derive its nutrition, so amount and unit edits can't drift from the totals.
  function updateRow(clientId: string, patch: Partial<DraftIngredient>) {
    setIngredients((prev) => prev.map((r) => (r.__clientId === clientId ? withNutrition({ ...r, ...patch }) : r)));
  }

  function removeRow(clientId: string) {
    setIngredients((prev) => prev.filter((r) => r.__clientId !== clientId));
  }

  // Resolve a picker selection — either a new row (mode: add) or replacing
  // the placeholder/food on an existing row (mode: replace). `selection` carries
  // the serving + amount the user had chosen in the picker (e.g. their last log of
  // "0.47 lb"); without it we default to one canonical serving in a real unit.
  function handlePickFood(food: Food, selection?: { servingId: string | null; quantity: number | null }) {
    const servings = food.servings ?? [];
    if (servings.length === 0) {
      toast.error(`${food.name} has no serving — open it in the library to add one`);
      return;
    }
    // Pick the serving: the user's selection if valid, else a real non-gram base
    // unit (a food may have no canonical "serving" row — its base is 'g'/'lb'), so
    // we never default to the 'g' row and then mislabel a full serving's macros as 1 g.
    const seedServing =
      selection?.servingId != null ? servings.find((s) => s.id === selection.servingId) ?? null : null;
    const chosen = seedServing ?? servings.find((s) => s.unit !== "g") ?? servings[0];
    const ups = Number(chosen.units_per_serving) || 1;
    // Amount: the user's logged quantity when seeded, else one reference serving
    // expressed in the chosen unit (units_per_serving), matching the picker label.
    const quantity =
      seedServing && selection?.quantity != null && Number.isFinite(selection.quantity) && selection.quantity > 0
        ? selection.quantity
        : ups;
    // A replace keeps the row's place in the list but takes nothing else from
    // the old food — its serving base and nutrients are rebuilt from the new one.
    const clientId = picker?.mode === "replace" ? picker.clientId : newClientId("new");
    const row = buildRow(clientId, food, chosen.id, quantity);
    if (picker?.mode === "replace") {
      setIngredients((prev) => prev.map((r) => (r.__clientId === clientId ? { ...row, id: r.id, display_order: r.display_order } : r)));
    } else {
      setIngredients((prev) => [...prev, row]);
    }
    if (!row.__base?.nutrients) hydrateNutrients(clientId, food.id);
    setPicker(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Recipe name is required");
      return;
    }
    const servings = parseServings(servingCount);
    if (servings == null) {
      toast.error(`Servings must be a number between 0 and ${RECIPE_SERVINGS_MAX}`);
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        serving_count: servings,
        icon,
        ingredients: ingredients.map<RecipeIngredientInput>((r) => {
          // A virtual-unit selection (e.g. lb on a gram-based food) is converted
          // back to the food's real base unit so the stored row references a real serving.
          const resolved = resolveServingForSave(r.food_servings ?? [], r.serving_id, r.quantity);
          return {
            ingredient_food_id: r.ingredient_food_id,
            serving_id: resolved.serving_id,
            quantity: resolved.quantity,
            placeholder_name: r.placeholder_name,
            placeholder_quantity_text: r.placeholder_quantity_text,
          };
        }),
      };
      const res = await fetch(`/modules/forage/api/recipes/${recipeId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save recipe");
        return;
      }
      const updated: Recipe = await res.json();
      setRecipe(updated);
      setName(updated.name);
      setServingCount(String(updated.serving_count));
      setIcon(updated.icon);
      setIngredients(updated.ingredients.map(toDraft));
      // Drop back to the read-only view once the changes are persisted.
      setIsEditing(false);
      toast.success("Recipe saved");
    } catch {
      toast.error("Failed to save recipe");
    } finally {
      setIsSaving(false);
    }
  }

  // Discard the draft and return to the saved recipe. A still-blank new recipe
  // has nothing to return to, so Cancel leaves the page (and disposes it).
  function handleCancel() {
    if (!recipe) return;
    if (isBlank(recipe.name, recipe.ingredients.length, recipe.icon)) {
      goBack();
      return;
    }
    setName(recipe.name);
    setServingCount(String(recipe.serving_count));
    setIcon(recipe.icon);
    setIngredients(recipe.ingredients.map(toDraft));
    setPicker(null);
    setIsEditing(false);
  }

  function handleDelete() {
    if (!recipe) return;
    setDeleteModalOpen(true);
  }

  async function confirmDelete() {
    setIsDeleting(true);
    // Mark deleted so the disposal-on-exit cleanup doesn't fire a second DELETE.
    deletedRef.current = true;
    try {
      const res = await fetch(`/modules/forage/api/recipes/${recipeId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete");
        setIsDeleting(false);
        return;
      }
      router.push("/modules/forage/ui/recipes");
    } catch {
      toast.error("Failed to delete");
      setIsDeleting(false);
    }
  }

  const Icon = resolveFoodIcon(icon);

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER — MF-style: back + centered title + Save right, all on one row */}
        <div
          className="flex items-center"
          style={{ marginBottom: "1rem", gap: "0.5rem", flexWrap: "nowrap" }}
        >

          {/* NAV GROUP */}
          <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
            <UpLink
              className="btn btn-link"
              href="/modules/forage/ui/recipes"
              onNavigate={goBack}
              aria-label="Recipes"
              style={{ paddingLeft: 0 }}
            >
              <ArrowLeft className="w-5 h-5" />
            </UpLink>
          </div>

          {/* TITLE — centered, takes remaining space, truncates rather than wraps */}
          <h1
            className="text-page-title"
            style={{
              flex: 1,
              textAlign: "center",
              margin: 0,
              fontSize: "1rem",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {isEditing ? "Edit Recipe" : "Recipe"}
          </h1>

          {/* PRIMARY ACTIONS — Cancel + Save while editing, Edit while viewing */}
          {isEditing ? (
            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>

              {/* CANCEL */}
              <Button
                className="btn-off"
                onClick={handleCancel}
                disabled={isSaving || isLoading}
                style={{ padding: "0.4rem 0.7rem" }}
              >
                Cancel
              </Button>

              {/* SAVE — disabled until the draft differs from the saved recipe */}
              <Button
                className="btn-blue"
                onClick={handleSave}
                disabled={isSaving || isLoading || !isDirty}
                aria-label="Save recipe"
                style={{ padding: "0.4rem 0.7rem" }}
              >
                <Save className="w-4 h-4" /> {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <HeaderEditButton
              onClick={() => setIsEditing(true)}
              disabled={isLoading || !recipe}
              aria-label="Edit recipe"
              style={{ flexShrink: 0 }}
            />
          )}
        </div>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          <>

            {isEditing ? (
              /* META SECTION (edit) — MF-style stacked form fields with bold labels above inputs */
              <div className="flex flex-col gap-4" style={{ marginBottom: "1.25rem" }}>

                {/* RECIPE NAME FIELD */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="recipe-name" className="text-label" style={{ margin: 0 }}>Recipe Name</label>
                    {!name.trim() && <span className="text-muted" style={{ fontSize: "0.75rem" }}>Required</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      className="btn-off"
                      onClick={() => setIconPickerOpen(true)}
                      aria-label="Pick icon"
                      style={{ padding: "0.6rem", flexShrink: 0 }}
                    >
                      <Icon className="w-5 h-5" />
                    </Button>
                    <input
                      id="recipe-name"
                      type="text"
                      className="input-field"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onFocus={selectOnFocus}
                      onKeyDown={blurOnEnter}
                      placeholder="Enter recipe name"
                      maxLength={RECIPE_NAME_MAX}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>
                </div>

                {/* SERVINGS FIELD */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="recipe-servings" className="text-label" style={{ margin: 0 }}>Servings</label>
                    {servingCount.trim() !== "" && parseServings(servingCount) == null && (
                      <span className="text-muted" style={{ fontSize: "0.75rem" }}>Must be more than 0</span>
                    )}
                  </div>
                  <input
                    id="recipe-servings"
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.1"
                    className="input-field"
                    value={servingCount}
                    onChange={(e) => setServingCount(e.target.value)}
                    onFocus={selectOnFocus}
                    onKeyDown={blurOnEnter}
                    aria-invalid={parseServings(servingCount) == null}
                    onBlur={(e) => { if (e.target.value.trim() === "") setServingCount(String(recipe?.serving_count ?? 1)); }}
                  />
                </div>
              </div>
            ) : (
              /* META SECTION (view) — icon + name + servings summary, read-only */
              <div className="flex items-center gap-3" style={{ marginBottom: "1.25rem" }}>

                {/* ICON */}
                <Icon className="w-9 h-9" style={{ flexShrink: 0 }} />

                {/* NAME + SERVINGS */}
                <div style={{ minWidth: 0 }}>

                  {/* NAME */}
                  <div className="text-primary" style={{ fontWeight: 600, fontSize: "1.125rem" }}>{name}</div>

                  {/* SERVINGS */}
                  <div className="text-muted" style={{ fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                    {yieldCount} {yieldCount === 1 ? "serving" : "servings"}
                  </div>
                </div>
              </div>
            )}

            {/* NUTRITION SUMMARY — sits above the ingredients so amount edits read
                back immediately, without scrolling past the list. */}
            <div className="sub-card fg-recipe-sum">

              {/* SCOPE — per serving vs whole recipe */}
              <SegmentedToggle
                options={[
                  { value: "serving", label: "Per serving" },
                  { value: "recipe", label: "Whole recipe" },
                ]}
                value={nutritionScope}
                onChange={setNutritionScope}
                ariaLabel="Nutrition scope"
              />

              {/* MACRO TILES */}
              <MacroTiles
                kcal={totals.kcal / scopeDivisor}
                protein={totals.protein / scopeDivisor}
                fat={totals.fat / scopeDivisor}
                carbs={totals.carbs / scopeDivisor}
              />

              {/* UNRESOLVED — placeholders count as zero until a food is picked */}
              {placeholderCount > 0 && (
                <div className="fg-recipe-unresolved">
                  {placeholderCount} {placeholderCount === 1 ? "ingredient isn't" : "ingredients aren't"} counted until matched to a food
                </div>
              )}
            </div>

            {/* INGREDIENTS SECTION — MF shape: bold label + small circular "+" + helper text, then cards */}
            <div className="flex flex-col gap-2" style={{ marginBottom: "1.25rem" }}>

              {/* HEADER ROW */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-label" style={{ margin: 0, fontSize: "1rem", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                    Ingredients
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: "0.125rem" }}>
                    {ingredients.length === 0
                      ? "No ingredients"
                      : `${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}`}
                  </div>
                </div>

                {/* INGREDIENT ACTIONS — only while editing */}
                {isEditing && (
                  <div className="flex items-center gap-1">

                    {/* PHOTO SCAN */}
                    <Button
                      className="btn-off"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isScanning}
                      aria-label="Add ingredients from photo"
                      style={{ padding: "0.5rem", borderRadius: "999px", flexShrink: 0 }}
                    >
                      <Camera className="w-4 h-4" />
                    </Button>

                    {/* ADD MANUALLY */}
                    <Button
                      className="btn-off"
                      onClick={() => setPicker({ mode: "add" })}
                      aria-label="Add ingredient"
                      style={{ padding: "0.5rem", borderRadius: "999px", flexShrink: 0 }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* HIDDEN FILE INPUT */}
                {isEditing && (
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                )}
              </div>

              {/* LIST CONTAINER */}
              <div className="flex flex-col gap-2">
                {ingredients.length === 0 && isEditing && (
                  /* EMPTY INGREDIENT LIST — the two ways in, full width */
                  <div className="fg-recipe-empty">
                    <Button className="btn-blue" onClick={() => setPicker({ mode: "add" })}>
                      <Plus className="w-4 h-4" /> Add ingredient
                    </Button>
                    <Button className="btn-off" onClick={() => photoInputRef.current?.click()} disabled={isScanning}>
                      <Camera className="w-4 h-4" /> From photo
                    </Button>
                  </div>
                )}

                {ingredients.map((row) => {

                  // VIEW ROW — read-only and tappable: the whole row opens the
                  // ingredient's food detail page. Placeholder rows (no resolved
                  // food) stay inert since there's nothing to navigate to.
                  if (!isEditing) {
                    const navigable = !!row.ingredient_food_id;
                    return (
                      /* INGREDIENT ROW (view) — tap to open the food's detail page */
                      <button
                        key={row.__clientId}
                        type="button"
                        className="sub-card fg-ing fg-ing-row"
                        onClick={navigable ? () => router.push(`/modules/forage/ui/library/${row.ingredient_food_id}`) : undefined}
                        disabled={!navigable}
                        aria-label={navigable ? `Open ${row.food_name} details` : undefined}
                      >

                        {/* AVATAR — the ingredient food's product photo, its icon as fallback */}
                        <FoodAvatar
                          food={{ id: row.ingredient_food_id ?? "", icon: row.food_icon, image_updated_at: row.ingredient_food_id ? row.food_image_updated_at : null }}
                          variant="inline"
                          className="fg-ing-icon"
                        />

                        {/* BODY — name/brand stacked above the derived macros */}
                        <div className="fg-ing-titles">

                          {/* FOOD NAME — an unmatched import line shows its own text */}
                          <div className="fg-ing-name">{row.food_name ?? row.placeholder_name}</div>

                          {/* BRAND */}
                          {row.food_brand && (
                            <div className="fg-ing-brand">{row.food_brand}</div>
                          )}

                          {/* MACRO TIER — derived kcal + coloured P/F/C */}
                          {navigable ? (
                          <div className="fg-ing-macros">

                            {/* CALORIES */}
                            <span>{Math.round(row.kcal ?? 0)} kcal</span>

                            {/* PROTEIN */}
                            <span className="fg-ing-p">{Math.round(row.protein_g ?? 0)}P</span>

                            {/* FAT */}
                            <span className="fg-ing-f">{Math.round(row.fat_g ?? 0)}F</span>

                            {/* CARBS */}
                            <span className="fg-ing-c">{Math.round(row.carbs_g ?? 0)}C</span>
                          </div>
                          ) : (
                            <div className="fg-ing-macros">Not matched to a food</div>
                          )}
                        </div>

                        {/* TRAILING — amount/unit summary + chevron affordance */}
                        <div className="fg-ing-trail">

                          {/* QTY / UNIT */}
                          <span className="fg-ing-qty-view">
                            {navigable
                              ? `${Math.round((row.quantity ?? 0) * 1000) / 1000} ${row.serving_unit ?? ""}`
                              : row.placeholder_quantity_text}
                          </span>

                          {/* CHEVRON — only when the row opens a detail page */}
                          {navigable && <ChevronRight className="fg-ing-chev" />}
                        </div>
                      </button>
                    );
                  }

                  if (!row.ingredient_food_id) {
                    return (
                      /* PLACEHOLDER ROW (edit) — an imported line awaiting a library food */
                      <div key={row.__clientId} className="fg-ing fg-ing-editing fg-ing-placeholder">

                        {/* IMPORTED TEXT */}
                        <div className="fg-ing-titles">
                          <div className="fg-ing-name">{row.placeholder_name}</div>
                          {row.placeholder_quantity_text && (
                            <div className="fg-ing-brand">{row.placeholder_quantity_text}</div>
                          )}
                        </div>

                        {/* ACTIONS */}
                        <div className="fg-ing-controls">

                          {/* MATCH */}
                          <Button
                            className="btn-blue"
                            onClick={() => setPicker({ mode: "replace", clientId: row.__clientId })}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                          >
                            <Search className="w-3.5 h-3.5" /> Choose food
                          </Button>

                          {/* DELETE */}
                          <Button
                            className="btn-link-red"
                            onClick={() => removeRow(row.__clientId)}
                            aria-label={`Remove ${row.placeholder_name ?? "ingredient"}`}
                            style={{ padding: "0.25rem" }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    /* INGREDIENT ROW (edit) — full editable card */
                    <div key={row.__clientId} className="fg-ing fg-ing-editing">

                      {/* NAME TIER — icon + full-width food name (wraps for readability) */}
                      <div className="fg-ing-head">

                        {/* AVATAR — the ingredient food's product photo, its icon as fallback */}
                        <FoodAvatar
                          food={{ id: row.ingredient_food_id ?? "", icon: row.food_icon, image_updated_at: row.ingredient_food_id ? row.food_image_updated_at : null }}
                          variant="inline"
                          className="fg-ing-icon"
                        />

                        {/* NAME + BRAND */}
                        <div className="fg-ing-titles">

                          {/* FOOD NAME */}
                          <div className="fg-ing-name">{row.food_name}</div>

                          {/* BRAND */}
                          {row.food_brand && (
                            <div className="fg-ing-brand">{row.food_brand}</div>
                          )}
                        </div>
                      </div>

                      {/* MACRO TIER — derived kcal + coloured P/F/C */}
                      <div className="fg-ing-macros">

                        {/* CALORIES */}
                        <span>{Math.round(row.kcal ?? 0)} kcal</span>

                        {/* PROTEIN */}
                        <span className="fg-ing-p">{Math.round(row.protein_g ?? 0)}P</span>

                        {/* FAT */}
                        <span className="fg-ing-f">{Math.round(row.fat_g ?? 0)}F</span>

                        {/* CARBS */}
                        <span className="fg-ing-c">{Math.round(row.carbs_g ?? 0)}C</span>
                      </div>

                      {/* CONTROL TIER — qty/unit editor + row actions */}
                      <div className="fg-ing-controls">

                        {/* QTY / UNIT */}
                        <div className="fg-ing-qty">

                          {/* AMOUNT — fraction-capable so a recipe amount can be typed
                              the way it reads on the card ("1/8", "1 1/2"); see AmountField */}
                          <AmountField
                            className="input-field fg-ing-amt"
                            value={String(row.__quantityText ?? row.quantity)}
                            onFocus={selectOnFocus}
                            onKeyDown={blurOnEnter}
                            aria-label={`Amount of ${row.food_name ?? "ingredient"}`}
                            onValueChange={(raw) => {
                              // Keep the raw text so the field can be empty/partial
                              // ("", ".", "1.", "1/") instead of snapping to 0 mid-edit.
                              const newQ = parseAmount(raw);
                              // Only rescale macros for a usable positive number;
                              // otherwise just hold the text and leave quantity be.
                              if (raw === "" || !Number.isFinite(newQ) || newQ <= 0) {
                                updateRow(row.__clientId, { __quantityText: raw });
                                return;
                              }
                              updateRow(row.__clientId, { __quantityText: raw, quantity: newQ });
                            }}
                            onBlur={() => {
                              // Drop the text override so the field re-syncs to the
                              // numeric quantity (a left-empty field reverts to its
                              // last valid value rather than persisting blank/0).
                              if (row.__quantityText !== undefined) {
                                updateRow(row.__clientId, { __quantityText: undefined });
                              }
                            }}
                          />
                          {(row.food_servings?.length ?? 0) > 1 ? (
                            <select
                              className="input-field fg-ing-unit"
                              value={row.serving_id ?? ""}
                              onChange={(e) => {
                                // Unit switch keeps the typed amount verbatim (no conversion);
                                // updateRow re-derives the nutrition for the new unit.
                                const next = row.food_servings?.find((s) => s.id === e.target.value);
                                if (!next) return;
                                updateRow(row.__clientId, {
                                  serving_id: next.id,
                                  serving_unit: next.unit,
                                  units_per_serving: next.units_per_serving,
                                });
                              }}
                            >
                              <ServingUnitOptions servings={row.food_servings!} />
                            </select>
                          ) : (
                            <span className="fg-ing-unit-static">
                              {row.serving_unit}
                            </span>
                          )}
                        </div>

                        {/* ACTIONS */}
                        <div className="fg-ing-actions">

                          {/* REPLACE */}
                          <Button
                            className="btn-link"
                            onClick={() => setPicker({ mode: "replace", clientId: row.__clientId })}
                            aria-label={`Replace ${row.food_name ?? "ingredient"}`}
                            title="Replace"
                            style={{ padding: "0.35rem" }}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>

                          {/* DELETE */}
                          <Button
                            className="btn-link-red"
                            onClick={() => removeRow(row.__clientId)}
                            aria-label={`Remove ${row.food_name ?? "ingredient"}`}
                            title="Remove"
                            style={{ padding: "0.35rem" }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MICRONUTRIENTS — shared banded bars (floor/target/ceiling + program-target
                glyph), aggregated across ingredients and scaled to the [Serving | Recipe]
                scope chosen on the nutrition summary above. */}
            <div style={{ marginBottom: "1.25rem" }}>
              <FoodNutrientBreakdown nutrients={nutrientCatalog} foodNutrients={aggregatedNutrients} />
            </div>

            {/* USED IN RECIPES — other recipes that nest this recipe as an
                ingredient (a recipe is itself a food). Shared with the food
                detail surfaces; hidden when this recipe isn't used anywhere. */}
            <RecipeUsageList foodId={recipeId} />

            {/* DANGER ZONE — delete tucked at the bottom so it can't be tapped by
                accident; only while editing so the read-only view stays clean */}
            {isEditing && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button className="btn-red" onClick={handleDelete} disabled={isSaving} aria-label="Delete recipe">
                  <Trash2 className="w-4 h-4" /> Delete recipe
                </Button>
              </div>
            )}
          </>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>

      {/* FOOD PICKER MODAL */}
      {picker && (
        <AddEntryModal
          date={new Date().toISOString().slice(0, 10)}
          mode="create"
          defaultTime="12:00"
          initialPicker="search"
          editingEntry={null}
          onClose={() => setPicker(null)}
          onSaved={() => {}}
          hideTabs={["recipes"]}
          ingredientMode
          onPickFood={handlePickFood}
        />
      )}

      {/* ICON PICKER MODAL */}
      {iconPickerOpen && (
        <IconPicker
          current={icon}
          onPick={(code) => {
            setIcon(code);
            setIconPickerOpen(false);
          }}
          onClose={() => setIconPickerOpen(false)}
        />
      )}

      {/* DELETE RECIPE MODAL */}
      {deleteModalOpen && recipe && (
        <Modal
          isOpen={true}
          onClose={() => { if (!isDeleting) setDeleteModalOpen(false); }}
          disableClose={isDeleting}
          title="Delete recipe"
          footer={
            /* MODAL ACTIONS */
            <div className="flex" style={{ gap: "0.5rem", justifyContent: "flex-end", width: "100%" }}>

              {/* CANCEL */}
              <Button className="btn-off" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>

              {/* CONFIRM DELETE */}
              <Button className="btn-red" onClick={confirmDelete} disabled={isDeleting} aria-label="Confirm delete recipe">
                <Trash2 className="w-4 h-4" /> {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          }
        >
          {/* CONFIRMATION COPY */}
          <p className="text-muted" style={{ margin: 0 }}>
            Remove <strong className="text-primary">{recipe.name}</strong> from your recipes? This can&apos;t be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}

function IconPicker({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (code: string | null) => void;
  onClose: () => void;
}) {
  return (
    /* ICON PICKER MODAL */
    <Modal isOpen={true} onClose={onClose} title="Pick an icon">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(3rem, 1fr))", gap: "0.5rem" }}>
        {FOOD_ICONS.map((opt) => {
          const Icon = opt.Icon;
          const active = current === opt.code;
          return (
            /* ICON OPTION */
            <button
              key={opt.code}
              type="button"
              onClick={() => onPick(opt.code)}
              aria-label={opt.label}
              aria-pressed={active}
              className={active ? "btn btn-blue" : "btn btn-off"}
              style={{ padding: "0.75rem", aspectRatio: "1 / 1" }}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
