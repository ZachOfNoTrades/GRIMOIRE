"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { useParams, useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  async function loadFood() {
    setIsLoading(true);
    try {
      const r = await fetch(`/modules/forage/api/foods/${foodId}`);
      if (!r.ok) {
        toast.error("Food not found");
        router.push("/modules/forage/ui/library");
        return;
      }
      const data: FoodWithIngredients = await r.json();
      setFood(data);
      // Explicit edit deep-link (?edit=1, used by the food logger's row ⋮ "Edit
      // food" action so it lands straight in the editor — same contract as the
      // recipe page). Opened any other way the page stays read-only.
      const editParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      if (editParams?.get("edit") === "1") setIsEditing(true);
    } catch {
      toast.error("Failed to load food");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (foodId) loadFood();
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
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER */}
        <div
          className="flex items-center"
          style={{ marginBottom: "1rem", gap: "0.5rem", flexWrap: "nowrap" }}
        >

          {/* BACK — return to wherever the user came from (library list, the
              diary timeline's "View food", search results, etc.). Falls back to
              the library list when there's no in-app history to pop. */}
          <BackLink
            fallback="/modules/forage/ui/library"
            className="btn btn-link"
            aria-label="Back"
            style={{ paddingLeft: 0, flexShrink: 0 }}
          >
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* TITLE */}
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
            {isEditing ? "Edit food" : food?.name ?? "Food"}
          </h1>

          {/* RESYNC — only for foods that carry a source link. Re-scrapes that
              page and refreshes the nutrition in place. Icon-only so the header
              stays on one line on a phone. */}
          {!isEditing && food?.source_url && (
            <Button
              className="btn-off"
              onClick={handleResync}
              disabled={isLoading || isResyncing}
              aria-label="Resync nutrition from source link"
              title={`Resync from ${sourceUrlHost(food.source_url)}`}
              style={{ padding: "0.4rem 0.55rem", flexShrink: 0 }}
            >
              <RefreshCw className={`w-4 h-4${isResyncing ? " animate-spin" : ""}`} />
            </Button>
          )}

          {/* EDIT — hidden while editing; the inline form carries its own
              Save/Cancel action bar. */}
          {!isEditing && (
            <Button
              className="btn-blue"
              onClick={() => setIsEditing(true)}
              disabled={isLoading || !food}
              aria-label="Edit food"
              style={{ padding: "0.4rem 0.7rem", flexShrink: 0 }}
            >
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          )}
        </div>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : food ? (
          isEditing ? (
            /* EDIT MODE — integrated full-page food editor (no modal overlay).
               Replaces the read-only details in place; its own action bar
               carries Save/Cancel. */
            <FoodForm
              variant="page"
              foodId={food.id}
              onClose={() => setIsEditing(false)}
              onSaved={() => {
                setIsEditing(false);
                loadFood();
              }}
            />
          ) : (
            <>

              {/* FOOD DETAILS — shared with the diary detail modal */}
              <FoodDetailContent
                food={food}
                nutrients={nutrients}
                onToggleFavorite={handleToggleFavorite}
                isFaving={isFaving}
              />

              {/* DANGER ZONE */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
                <Button className="btn-red" onClick={handleDelete} aria-label="Delete food">
                  <Trash2 className="w-4 h-4" /> Delete food
                </Button>
              </div>
            </>
          )
        ) : null}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>

      {/* DELETE-FOOD CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}

