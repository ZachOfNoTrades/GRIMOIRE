"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, ChevronRight, Plus, Search, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Food } from "../../types/food";
import { resolveFoodIcon } from "../../lib/foodIcons";

export default function ForageLibraryPage() {
  const router = useRouter();
  const goBack = useGoBack();

  // DATA
  const [foods, setFoods] = useState<Food[]>([]);

  // INPUT
  const [search, setSearch] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  // Search runs server-side: listFoods caps at TOP 200, so client-side
  // filtering over a single fetch silently hides anything past the first 200
  // names (e.g. "Water"). Pass the query to the API instead so the cap applies
  // to the *matches*, not the whole library.
  async function loadFoods(query: string) {
    setIsLoading(true);
    try {
      const q = query.trim();
      const url = q
        ? `/modules/forage/api/foods?search=${encodeURIComponent(q)}`
        : `/modules/forage/api/foods`;
      const r = await fetch(url);
      const data = await r.json();
      setFoods(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load foods");
    } finally {
      setIsLoading(false);
    }
  }

  // Debounce so each keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => loadFoods(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER ROW */}
        <div className="card-header" style={{ marginBottom: "1rem" }}>

          {/* TITLE GROUP */}
          <div className="flex items-center gap-2">
            <Button className="btn-link" onClick={() => goBack("/modules/forage/ui/settings")} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-page-title"><Apple className="w-6 h-6" /> Food library</h1>
          </div>

          {/* NEW FOOD — dedicated create wizard page. */}
          <Button className="btn-blue" onClick={() => router.push("/modules/forage/ui/library/new")}>
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>

        {/* SEARCH */}
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-label" htmlFor="library-search">Search</label>
          <div style={{ position: "relative" }}>
            <Search className="w-4 h-4" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray)", pointerEvents: "none" }} />
            <input
              id="library-search"
              type="search"
              className="input-field"
              placeholder="Search foods…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoCapitalize="words"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
        </div>

        {/* FOOD LIST */}
        <div className="flex flex-col gap-2">
          {isLoading && (
            <div className="loading-container"><div className="loading-spinner" /></div>
          )}
          {!isLoading && foods.length === 0 && (
            <div className="text-muted" style={{ textAlign: "center", padding: "2rem 0" }}>
              {search.trim()
                ? "No foods match that search."
                : "Your library is empty. Tap New to add your first food."}
            </div>
          )}
          {!isLoading && foods.map((food) => {
            const FoodIcon = resolveFoodIcon(food.icon);
            return (
              /* FOOD ITEM CARD */
              <button
                key={food.id}
                type="button"
                className="sub-card"
                onClick={() => router.push(`/modules/forage/ui/library/${food.id}`)}
                style={{
                  padding: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >

                {/* ICON */}
                <FoodIcon className="w-5 h-5" style={{ flexShrink: 0 }} />

                {/* NAME + MACROS */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-primary" style={{ fontWeight: 600, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {food.name}
                  </div>
                  {food.brand && (
                    <div className="text-muted" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{food.brand}</div>
                  )}
                  <div className="text-muted" style={{ fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", marginTop: "0.125rem" }}>
                    {Math.round(food.kcal_per_serving)} kcal · {Math.round(food.protein_g_per_serving)}P {Math.round(food.fat_g_per_serving)}F {Math.round(food.carbs_g_per_serving)}C
                  </div>
                </div>

                {/* CHEVRON */}
                <ChevronRight className="w-4 h-4" style={{ flexShrink: 0, color: "var(--color-gray)" }} />
              </button>
            );
          })}
        </div>

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
