"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast, { Toaster } from "@/components/Toaster";
import { Camera, Plus, Trash2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderEditButton } from "@/components/ui/HeaderEditButton";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { SaveBar } from "@/components/ui/SaveBar";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import Breadcrumbs from "@/components/Breadcrumbs";
import { selectOnFocus, blurOnEnter } from "@/lib/inputBehavior";
import Modal from "@/components/Modal";
import { Recipe, RecipeIngredient, RecipeIngredientInput } from "../../../types/recipe";
import { Food, FoodNutrient } from "../../../types/food";
import { resolveFoodIcon, FOOD_ICONS } from "../../../lib/foodIcons";
import { IngredientCard, IngredientMacros } from "../../../components/IngredientCard";
import { MacroSummary } from "../../../components/MacroSummary";
import { RECIPE_NAME_MAX, RECIPE_SERVINGS_MAX } from "../../../lib/recipeConstants";
import { fmtServingAmount, parseAmount } from "../../../lib/format";
import { AmountField } from "../../../components/AmountField";
import { expandVirtualServings, resolveServingForSave } from "../../../lib/virtualUnits";
import { ServingUnitOptions } from "../../../components/ServingUnitOptions";
import { AddEntryModal, FoodNutrientBreakdown, RecipeUsageList, useNutrients, prefetchNutrientTargets } from "../../_diary";
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
    food_servings: expandVirtualServings(r.ingredient_food_id ?? "", r.food_servings ?? [], r.food_containers ?? []),
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

  // Leave the page for a breadcrumb or Cancel, deleting an empty blank recipe first
  async function goTo(href: string) {
    if (recipeIsDisposable()) {
      deletedRef.current = true;
      try {
        await fetch(`/modules/forage/api/recipes/${recipeId}`, { method: "DELETE" });
      } catch {
        // best-effort — fall through to navigation regardless
      }
    }
    router.push(href);
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
    const servings = expandVirtualServings(food.id, food.servings ?? [], food.containers ?? []);
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
      goTo("/modules/forage/ui/recipes");
      return;
    }
    setName(recipe.name);
    setServingCount(String(recipe.serving_count));
    setIcon(recipe.icon);
    setIngredients(recipe.ingredients.map(toDraft));
    setPicker(null);
    setIsEditing(false);
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

  const addActions = (
    <>

      {/* FROM PHOTO */}
      <Button className="btn-off btn-sm" onClick={() => photoInputRef.current?.click()} disabled={isScanning}>
        <Camera className="w-4 h-4" aria-hidden /> From photo
      </Button>

      {/* ADD INGREDIENT */}
      <Button className="btn-off btn-sm" onClick={() => setPicker({ mode: "add" })}>
        <Plus className="w-4 h-4" aria-hidden /> Add ingredient
      </Button>
    </>
  );

  return (

    // PAGE
    <div className="page-with-bottom-bar">

      {/* PAGE SCROLL */}
      <div className="page-scroll">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER ROW */}
        <div className="page-head-row">

          {/* BREADCRUMBS */}
          <Breadcrumbs className="breadcrumbs-inline" onNavigate={goTo} />

          {/* HEADER ACTIONS */}
          <div className="page-head-actions">

            {/* EDIT BUTTON */}
            {!isEditing && (
              <HeaderEditButton className="btn-sm" onClick={() => setIsEditing(true)} disabled={isLoading || !recipe} aria-label="Edit recipe" />
            )}

            {/* MORE MENU */}
            <HeaderMenu
              disabled={isLoading || !recipe || isSaving}
              items={[{ label: "Delete", icon: <Trash2 className="w-4 h-4" />, onSelect: () => setDeleteModalOpen(true), danger: true }]}
            />
          </div>
        </div>

        {isLoading ? (

          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          <>

            {isEditing ? (
              <>

                {/* PAGE TITLE */}
                <h1 className="text-page-title fg-recipe-title">Edit Recipe</h1>

                {/* DETAILS FIELDS */}
                <div className="fg-recipe-fields">

                  {/* NAME FIELD */}
                  <div className="fg-recipe-field fg-recipe-field-name">
                    <div className="fg-recipe-field-label">
                      <label htmlFor="recipe-name" className="field-label">Name</label>
                      {!name.trim() && <span className="text-muted">Required</span>}
                    </div>
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
                    />
                  </div>

                  {/* ICON FIELD */}
                  <div className="fg-recipe-field">
                    <span className="field-label">Icon</span>
                    <Button className="btn-off fg-recipe-icon-btn" onClick={() => setIconPickerOpen(true)} aria-label="Pick icon" title="Pick icon">
                      <Icon className="w-5 h-5" />
                    </Button>
                  </div>

                  {/* SERVINGS FIELD */}
                  <div className="fg-recipe-field">
                    <label htmlFor="recipe-servings" className="field-label">Servings</label>
                    <input
                      id="recipe-servings"
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      step="0.1"
                      className="input-field fg-recipe-servings"
                      value={servingCount}
                      onChange={(e) => setServingCount(e.target.value)}
                      onFocus={selectOnFocus}
                      onKeyDown={blurOnEnter}
                      aria-invalid={parseServings(servingCount) == null}
                      onBlur={(e) => { if (e.target.value.trim() === "") setServingCount(String(recipe?.serving_count ?? 1)); }}
                    />
                  </div>

                  {/* SERVINGS ERROR */}
                  {servingCount.trim() !== "" && parseServings(servingCount) == null && (
                    <span className="text-muted fg-recipe-field-error">Must be more than 0</span>
                  )}
                </div>
              </>
            ) : (
              <>

                {/* PAGE TITLE */}
                <h1 className="text-page-title fg-recipe-title">
                  <Icon className="fg-recipe-title-icon" aria-hidden />
                  <span>{name}</span>
                </h1>

                {/* SERVINGS */}
                <p className="text-muted fg-recipe-meta">{yieldCount} {yieldCount === 1 ? "serving" : "servings"}</p>
              </>
            )}

            {/* NUTRITION SUMMARY */}
            <MacroSummary
              kcal={totals.kcal / scopeDivisor}
              protein={totals.protein / scopeDivisor}
              fat={totals.fat / scopeDivisor}
              carbs={totals.carbs / scopeDivisor}
              control={
                <SegmentedToggle
                  options={[
                    { value: "serving", label: "Serving" },
                    { value: "recipe", label: "Recipe" },
                  ]}
                  value={nutritionScope}
                  onChange={setNutritionScope}
                  ariaLabel="Nutrition scope"
                />
              }
            />

            {/* INGREDIENTS SECTION */}
            <section className="fg-recipe-ingredients">

              {/* INGREDIENTS HEADER */}
              <div className="fg-recipe-ing-head">
                <h2 className="text-h2 fg-recipe-ing-title">Ingredients</h2>

                {/* TOP ADD ACTIONS */}
                {isEditing && <div className="fg-recipe-add-actions">{addActions}</div>}

                {/* HIDDEN FILE INPUT */}
                {isEditing && (
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                )}
              </div>

              {/* EMPTY LIST */}
              {ingredients.length === 0 && !isEditing && <p className="text-muted">No ingredients</p>}

              {/* INGREDIENT LIST */}
              <div className="fg-ing-list">
                {ingredients.map((row) => {
                  const food = { id: row.ingredient_food_id ?? "", icon: row.food_icon, image_updated_at: row.ingredient_food_id ? row.food_image_updated_at : null };
                  const rowName = row.food_name ?? row.placeholder_name ?? "Ingredient";

                  // Show a row unmatched to a food with its imported text; matched rows follow
                  if (!row.ingredient_food_id) {
                    return (

                      /* UNMATCHED INGREDIENT */
                      <IngredientCard key={row.__clientId} food={food} name={rowName} isUnmatched>

                        {/* NOT MATCHED LABEL */}
                        <span className="fg-ing-unmatched-label">Not matched</span>

                        {/* IMPORTED AMOUNT */}
                        {!isEditing && row.placeholder_quantity_text && <span className="fg-ing-amount">{row.placeholder_quantity_text}</span>}

                        {/* CHOOSE FOOD */}
                        {isEditing && (
                          <Button className="btn-blue btn-sm fg-ing-push" onClick={() => setPicker({ mode: "replace", clientId: row.__clientId })}>
                            <Search className="w-4 h-4" aria-hidden /> Choose food
                          </Button>
                        )}

                        {/* ROW MENU */}
                        {isEditing && (
                          <HeaderMenu
                            label={`Actions for ${rowName}`}
                            items={[{ label: "Remove", icon: <Trash2 className="w-4 h-4" />, onSelect: () => removeRow(row.__clientId), danger: true }]}
                          />
                        )}
                      </IngredientCard>
                    );
                  }

                  // Open the food from a viewed row; an edited row carries its amount, unit and menu
                  if (!isEditing) {
                    return (

                      /* INGREDIENT */
                      <IngredientCard
                        key={row.__clientId}
                        food={food}
                        name={rowName}
                        brand={row.food_brand}
                        onOpen={() => router.push(`/modules/forage/ui/library/${row.ingredient_food_id}`)}
                        openLabel={`Open ${rowName}`}
                      >

                        {/* MACROS */}
                        <IngredientMacros kcal={row.kcal ?? 0} protein={row.protein_g ?? 0} fat={row.fat_g ?? 0} carbs={row.carbs_g ?? 0} />

                        {/* AMOUNT */}
                        <span className="fg-ing-amount">{fmtServingAmount(row.quantity ?? 0, row.serving_unit ?? "")} {row.serving_unit ?? ""}</span>
                      </IngredientCard>
                    );
                  }

                  return (

                    /* EDITED INGREDIENT */
                    <IngredientCard key={row.__clientId} food={food} name={rowName} brand={row.food_brand}>

                      {/* MACROS */}
                      <IngredientMacros kcal={row.kcal ?? 0} protein={row.protein_g ?? 0} fat={row.fat_g ?? 0} carbs={row.carbs_g ?? 0} />

                      {/* CONTROLS */}
                      <span className="fg-ing-controls">

                        {/* AMOUNT — fraction-capable so an amount can be typed as it reads ("1/8", "1 1/2") */}
                        <AmountField
                          className="input-field fg-ing-amt"
                          value={row.__quantityText ?? fmtServingAmount(row.quantity, row.serving_unit ?? "")}
                          onFocus={selectOnFocus}
                          onKeyDown={blurOnEnter}
                          aria-label={`Amount of ${rowName}`}
                          onValueChange={(raw) => {
                            const newQ = parseAmount(raw);

                            // Hold only the raw text while it is empty or partial ("", ".", "1/"), and rescale the macros for a usable positive number
                            if (raw === "" || !Number.isFinite(newQ) || newQ <= 0) {
                              updateRow(row.__clientId, { __quantityText: raw });
                              return;
                            }
                            updateRow(row.__clientId, { __quantityText: raw, quantity: newQ });
                          }}
                          onBlur={() => {
                            // Drop the text so the field shows the last valid amount again
                            if (row.__quantityText !== undefined) {
                              updateRow(row.__clientId, { __quantityText: undefined });
                            }
                          }}
                        />

                        {/* UNIT */}
                        {(row.food_servings?.length ?? 0) > 1 ? (
                          <select
                            className="input-field fg-ing-unit"
                            value={row.serving_id ?? ""}
                            aria-label={`Unit of ${rowName}`}
                            onChange={(e) => {
                              // Keep the typed amount and re-derive the nutrition for the new unit
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
                          <span className="fg-ing-unit-static">{row.serving_unit}</span>
                        )}

                        {/* ROW MENU */}
                        <HeaderMenu
                          label={`Actions for ${rowName}`}
                          items={[
                            { label: "Replace", icon: <RotateCcw className="w-4 h-4" />, onSelect: () => setPicker({ mode: "replace", clientId: row.__clientId }) },
                            { label: "Remove", icon: <Trash2 className="w-4 h-4" />, onSelect: () => removeRow(row.__clientId), danger: true },
                          ]}
                        />
                      </span>
                    </IngredientCard>
                  );
                })}
              </div>

              {/* BOTTOM ADD ACTIONS — once the list holds anything */}
              {isEditing && ingredients.length > 0 && <div className="fg-recipe-add-actions fg-recipe-add-bottom">{addActions}</div>}
            </section>

            {/* NUTRITION — every tracked nutrient, scaled to the scope chosen above */}
            {aggregatedNutrients.length > 0 && (
              <CollapsibleSection title="Nutrition">
                <FoodNutrientBreakdown nutrients={nutrientCatalog} foodNutrients={aggregatedNutrients} />
              </CollapsibleSection>
            )}

            {/* USED IN RECIPES — hidden when no other recipe nests this one */}
            <RecipeUsageList foodId={recipeId} />
          </>
        )}
      </div>
      </div>

      {/* SAVE BAR — while editing, with Save disabled until the draft differs from the saved recipe */}
      {isEditing && <SaveBar onSave={handleSave} onCancel={handleCancel} isSaveDisabled={isLoading || !isDirty} isSaving={isSaving} />}

      {/* TOAST */}
      <Toaster position="bottom-center" containerStyle={isEditing ? { bottom: "5rem" } : undefined} />

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

            <>

              {/* CANCEL */}
              <Button className="btn-off" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>

              {/* CONFIRM DELETE */}
              <Button className="btn-red" onClick={confirmDelete} disabled={isDeleting} aria-label="Confirm delete recipe">
                <Trash2 className="w-4 h-4" /> {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >

          {/* CONFIRMATION COPY */}
          <p className="text-muted m-0">
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
