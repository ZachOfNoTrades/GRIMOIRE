"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast, { Toaster } from "@/components/Toaster";
import { Trash2, RefreshCw, Heart } from "lucide-react";
import { HeaderEditButton } from "@/components/ui/HeaderEditButton";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useConfirm } from "@/lib/useConfirm";
import { FoodWithIngredients } from "../../../types/recipe";
import { FoodForm, FoodDetailContent, useNutrients, prefetchNutrientTargets, sourceUrlHost } from "../../_diary";

export default function ForageFoodDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const foodId = params.id;
  const { confirm, confirmModal } = useConfirm();

  // DATA — recipe-source foods come back with their ingredients attached, so the
  // detail view renders them without a follow-up fetch.
  const [food, setFood] = useState<FoodWithIngredients | null>(null);
  const nutrients = useNutrients();

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isFaving, setIsFaving] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [saveBarSlot, setSaveBarSlot] = useState<HTMLDivElement | null>(null);

  // `honorEditParam` is set only for the initial load: ?edit=1 is a one-shot
  // "open in the editor" request, so the post-save reload must not re-enter it.
  async function loadFood({ honorEditParam = false }: { honorEditParam?: boolean } = {}) {
    setIsLoading(true);
    let redirecting = false;
    try {
      const r = await fetch(`/modules/forage/api/foods/${foodId}`);
      if (!r.ok) {
        toast.error("Food not found");
        router.push("/modules/forage/ui/library");
        return;
      }
      const data: FoodWithIngredients = await r.json();
      // Explicit edit deep-link (?edit=1, used by the food logger's row ⋮ "Edit
      // food" action so it lands straight in the editor — same contract as the
      // recipe page). Opened any other way the page stays read-only.
      const editParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const wantsEdit = honorEditParam && editParams?.get("edit") === "1";
      // RECIPES LIVE ON THEIR OWN PAGE — this page's editor only edits nutrients,
      // and a recipe's nutrition is derived from its ingredients. Hand any link
      // that lands here (library list, nutrient detail, old bookmarks) to the
      // recipe page, keeping the edit intent; stay in the loading state meanwhile.
      if (data.source === "recipe") {
        redirecting = true;
        router.replace(`/modules/forage/ui/recipes/${foodId}${wantsEdit ? "?edit=1" : ""}`);
        return;
      }
      setFood(data);
      if (wantsEdit) {
        setIsEditing(true);
        // CONSUME THE DEEP-LINK — drop ?edit=1 from the URL so a refresh or a
        // back-navigation to this entry after saving lands in the read-only view.
        editParams!.delete("edit");
        const qs = editParams!.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    } catch {
      toast.error("Failed to load food");
    } finally {
      if (!redirecting) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (foodId) loadFood({ honorEditParam: true });
  }, [foodId]);

  // Warm the resolved nutrient-target cache on mount so the breakdown bars have
  // their bands ready as soon as the food's nutrients load.
  useEffect(() => {
    prefetchNutrientTargets();
  }, []);

  async function handleToggleFavorite() {
    if (!food || isFaving) return;
    const previousFood = food;
    const nextFavorite = !food.is_favorite;
    // OPTIMISTIC UPDATE — trivial boolean toggle, roll back on failure.
    setFood({ ...food, is_favorite: nextFavorite });
    setIsFaving(true);
    try {
      const res = await fetch(`/modules/forage/api/foods/${food.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_favorite: nextFavorite }),
      });
      if (!res.ok) {
        setFood(previousFood);
        toast.error("Failed to update favorite");
      }
    } finally {
      setIsFaving(false);
    }
  }

  // RESYNC — re-read the food's source link and refresh its nutrition from the
  // page as it stands now. Confirmed first because it overwrites the stored
  // macros/nutrients; the server leaves identity (name, brand, icon) alone and
  // merges serving units, so nothing the user typed by hand is lost.
  async function handleResync() {
    if (!food?.source_url || isResyncing) return;
    const confirmed = await confirm({
      title: "Resync Nutrition",
      message: (
        <>
          Re-read nutrition for <strong>{food.name}</strong> from{" "}
          <strong>{sourceUrlHost(food.source_url)}</strong>? This replaces the stored calories,
          macros and nutrients with what the page says now.
        </>
      ),
      confirmLabel: "Resync",
    });
    if (!confirmed) return;
    setIsResyncing(true);
    const toastId = toast.loading("Resyncing from source…");
    try {
      const res = await fetch(`/modules/forage/api/foods/${food.id}/resync`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Resync failed", { id: toastId });
        return;
      }
      setFood(body);
      toast.success("Nutrition resynced", { id: toastId });
    } catch {
      toast.error("Resync failed", { id: toastId });
    } finally {
      setIsResyncing(false);
    }
  }

  async function handleDelete() {
    if (!food) return;
    const confirmed = await confirm({
      title: "Remove Food",
      message: (
        <>
          Remove <strong>{food.name}</strong> from your library?
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/modules/forage/api/foods/${food.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove food");
      return;
    }
    toast.success("Removed");
    router.push("/modules/forage/ui/library");
  }

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
          <Breadcrumbs className="breadcrumbs-inline" label="Food" />

          {/* HEADER ACTIONS */}
          <div className="page-head-actions">

            {/* EDIT BUTTON */}
            {!isEditing && (
              <HeaderEditButton className="btn-sm" onClick={() => setIsEditing(true)} disabled={isLoading || !food} aria-label="Edit food" />
            )}

            {/* MORE MENU */}
            <HeaderMenu
              disabled={isLoading || !food}
              items={[
                !isEditing && { label: "Favorite", icon: <Heart className="w-4 h-4" />, onSelect: handleToggleFavorite, checked: !!food?.is_favorite, disabled: isFaving },
                !isEditing && !!food?.source_url && { label: "Resync", icon: <RefreshCw className="w-4 h-4" />, onSelect: handleResync, disabled: isResyncing, title: `Resync nutrition from ${sourceUrlHost(food.source_url)}` },
                { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onSelect: handleDelete, danger: true },
              ]}
            />
          </div>
        </div>

        {isLoading ? (

          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : food ? (
          isEditing ? (

            /* EDIT MODE — the food editor in place of the details, with its own save bar */
            <FoodForm
              variant="page"
              foodId={food.id}
              saveBarSlot={saveBarSlot}
              onClose={() => setIsEditing(false)}
              onSaved={() => {
                setIsEditing(false);
                loadFood();
              }}
            />
          ) : (

            /* FOOD DETAILS */
            <FoodDetailContent food={food} nutrients={nutrients} />
          )
        ) : null}
      </div>
      </div>

      {/* SAVE BAR SLOT — the editor draws its save bar here, below the scroll area */}
      <div ref={setSaveBarSlot} />

      {/* TOAST */}
      <Toaster position="bottom-center" containerStyle={isEditing ? { bottom: "5rem" } : undefined} />

      {/* CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
