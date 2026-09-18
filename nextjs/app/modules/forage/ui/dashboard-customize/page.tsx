"use client";

import { useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "@/components/Toaster";
import { ChevronLeft, ChevronUp, ChevronDown, X, Check, Plus } from "lucide-react";
import { Nutrient } from "../../types/food";
import { DEFAULT_NUTRITION_CARDS } from "../../types/dashboard";
import { buildCardCatalog, CardCatalogEntry } from "../home/nutritionCards";
import "./customize.css";

export default function CustomizeDashboardPage() {
  const router = useRouter();

  // DATA — reference nutrients (labels/colors/grouping) + the persisted layout.
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [savedCards, setSavedCards] = useState<string[]>(DEFAULT_NUTRITION_CARDS);

  // INPUT — the working list of nutrition card keys being edited.
  const [cards, setCards] = useState<string[]>(DEFAULT_NUTRITION_CARDS);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Dirty when the working list differs from what's persisted (order-sensitive).
  const isDirty = useMemo(
    () => JSON.stringify(cards) !== JSON.stringify(savedCards),
    [cards, savedCards],
  );

  // Catalog of every addable card, grouped (Macros, Fat Breakdown, …).
  const catalog = useMemo(() => buildCardCatalog(nutrients), [nutrients]);
  // Flat key→entry map so the active list can render swatches/labels without
  // re-deriving them per row.
  const entryByKey = useMemo(() => {
    const map = new Map<string, CardCatalogEntry>();
    for (const group of catalog) for (const entry of group.entries) map.set(entry.key, entry);
    return map;
  }, [catalog]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/modules/forage/api/nutrients").then((r) => r.json()),
      fetch("/modules/forage/api/dashboard-cards?section=nutrition").then((r) => r.json()),
    ])
      .then(([nData, cData]) => {
        if (!alive) return;
        if (Array.isArray(nData)) setNutrients(nData);
        const loaded: string[] = Array.isArray(cData?.cards) ? cData.cards : DEFAULT_NUTRITION_CARDS;
        setSavedCards(loaded);
        setCards(loaded);
      })
      .catch((e) => console.error(e))
      .finally(() => alive && setIsLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // REORDER — swap a card with its neighbor (touch-friendly; no drag gesture).
  function move(index: number, delta: number) {
    setCards((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeCard(key: string) {
    setCards((prev) => prev.filter((k) => k !== key));
  }

  // TOGGLE — add (append) or remove a card from the picker.
  function toggleCard(key: string) {
    setCards((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    setIsSaving(true);
    try {
      const res = await fetch("/modules/forage/api/dashboard-cards", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section: "nutrition", cards }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = await res.json();
      const persisted: string[] = Array.isArray(data?.cards) ? data.cards : cards;
      setSavedCards(persisted);
      setCards(persisted);
      toast.success("Dashboard saved");
      router.push("/modules/forage/ui/home");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save dashboard");
    } finally {
      setIsSaving(false);
    }
  }

  // Label/swatch lookup with a graceful fallback for keys not yet in the catalog
  // (e.g. before nutrients load, or a code dropped from the reference table).
  function labelFor(key: string): string {
    return entryByKey.get(key)?.label ?? key;
  }
  function colorFor(key: string): string {
    return entryByKey.get(key)?.color ?? "var(--color-gray)";
  }

  return (
    /* PAGE — locked shell with sticky header + inner scroll region. */
    <div className="fg-customize">

      {/* HEADER */}
      <div className="fg-customize-header">

        {/* BACK */}
        <BackLink fallback="/modules/forage/ui/home" aria-label="Back" className="fg-customize-iconbtn">
          <ChevronLeft size={24} />
        </BackLink>

        {/* TITLE */}
        <div className="fg-customize-title">Customize Dashboard</div>

        {/* SAVE */}
        <button type="button" className="fg-customize-save" disabled={!isDirty || isSaving} onClick={save}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* SCROLL */}
      <div className="fg-customize-scroll">

        {/* BODY */}
        <div className="fg-customize-body">

          {isLoading ? (
            /* LOADING */
            <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
              <div style={{ width: 24, height: 24, border: "2px solid var(--card-border)", borderTopColor: "var(--color-primary)", borderRadius: 999, animation: "spin 0.8s linear infinite" }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              {/* NUTRITION SECTION HEADER */}
              <div className="fg-customize-section-head">Nutrition</div>

              {/* CARD LIST */}
              <div className="fg-customize-group">
                {cards.length === 0 ? (
                  /* EMPTY STATE */
                  <div className="fg-customize-empty">No cards. Use “Add or Remove Nutrients” below to add some.</div>
                ) : (
                  cards.map((key, index) => (
                    /* CARD ROW */
                    <div key={key} className="fg-customize-row">

                      {/* SWATCH */}
                      <div className="fg-customize-swatch">
                        <span style={{ background: colorFor(key) }} />
                      </div>

                      {/* LABEL */}
                      <div className="fg-customize-row-label">{labelFor(key)}</div>

                      {/* CONTROLS */}
                      <div className="fg-customize-row-controls">

                        {/* MOVE UP */}
                        <button type="button" aria-label={`Move ${labelFor(key)} up`} className="fg-customize-ctrl" disabled={index === 0} onClick={() => move(index, -1)}>
                          <ChevronUp size={18} />
                        </button>

                        {/* MOVE DOWN */}
                        <button type="button" aria-label={`Move ${labelFor(key)} down`} className="fg-customize-ctrl" disabled={index === cards.length - 1} onClick={() => move(index, 1)}>
                          <ChevronDown size={18} />
                        </button>

                        {/* REMOVE */}
                        <button type="button" aria-label={`Remove ${labelFor(key)}`} className="fg-customize-ctrl fg-customize-ctrl-remove" onClick={() => removeCard(key)}>
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ADD OR REMOVE NUTRIENTS */}
              <button type="button" className="fg-customize-add" onClick={() => setIsPickerOpen(true)}>
                Add or Remove Nutrients
              </button>
            </>
          )}
        </div>
      </div>

      {/* PICKER SHEET */}
      {isPickerOpen && (
        /* PICKER BACKDROP */
        <div className="fg-picker-backdrop" onClick={() => setIsPickerOpen(false)}>

          {/* PICKER PANEL */}
          <div className="fg-picker-panel" onClick={(e) => e.stopPropagation()}>

            {/* PICKER HEADER */}
            <div className="fg-picker-header">
              <div className="fg-picker-title">Add or Remove Nutrients</div>
              <button type="button" className="fg-picker-done" onClick={() => setIsPickerOpen(false)}>Done</button>
            </div>

            {/* PICKER SCROLL */}
            <div className="fg-picker-scroll">
              {catalog.map((group) => (
                /* PICKER GROUP */
                <div key={group.heading}>

                  {/* GROUP HEADING */}
                  <div className="fg-picker-group-head">{group.heading}</div>

                  {group.entries.map((entry) => {
                    const on = cards.includes(entry.key);
                    return (
                      /* PICKER ROW */
                      <button key={entry.key} type="button" className="fg-picker-row" onClick={() => toggleCard(entry.key)}>

                        {/* SWATCH */}
                        <div className="fg-customize-swatch">
                          <span style={{ background: entry.color }} />
                        </div>

                        {/* LABEL */}
                        <div className="fg-picker-row-label">{entry.label}</div>

                        {/* CHECK */}
                        <div className="fg-picker-check" data-on={on ? "true" : "false"}>
                          {on ? <Check size={15} strokeWidth={3} /> : <Plus size={15} style={{ color: "var(--color-gray)" }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <Toaster position="top-center" />
    </div>
  );
}
