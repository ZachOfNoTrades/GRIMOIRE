"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Flame, Info, MoreVertical, Pencil, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectOnFocus } from "@/lib/inputBehavior";
import { Food } from "../types/food";
import { FoodAvatar } from "./FoodAvatar";
import { fmtAmount, parseAmount } from "../lib/format";
import { AmountField } from "./AmountField";
import { ServingUnitOptions } from "./ServingUnitOptions";

// A staged plate item: the virtual-unit food plus the drafted amount + unit.
export type FoodRecordEntry = { food: Food; servingId: string | null; quantity: string };

/* ============================================================
   FOOD RECORD ROW — the one food row shared by every logger surface:
   the picker slides (Frequent / Latest / Library / recipes) and the
   "Your Plate" slide. Renders avatar + title + live macros, with a
   trailing control that is either a + (not yet staged) or the inline
   amount/unit editor (staged).

   There is deliberately ONE rendering, with no per-surface variation:
   a staged food looks and edits exactly the same wherever it appears,
   so the plate is the picker's rows filtered to what you staged.
   ============================================================ */

export function FoodRecordRow({
  food,
  entry,
  inCollection,
  onAdd,
  onOpenDetails,
  onView,
  onEdit,
  onUpdateQuantity,
  onUpdateUnit,
  onCommitQuantity,
}: {
  food: Food;
  // The staged collection item for this food (its virtual-unit food + qty + unit),
  // or null when not yet staged. Drives the inline editor + live macros.
  entry: FoodRecordEntry | null;
  inCollection: boolean;
  // + commits 1 default serving (fast path); on the plate it is replaced inline by
  // the amount editor. Omitted on surfaces where every row is already staged.
  onAdd?: () => void;
  // Tap the row body → open the full FoodDetails sheet (qty/unit + Add/Cancel; no autocommit).
  onOpenDetails: () => void;
  // ⋮ MENU ACTIONS — open the food's (or recipe's) own read-only detail page and
  // its editor. Both leave the logger, so the host wires the close + navigation.
  // Omit both and the ⋮ is not rendered (the row body tap still opens details).
  onView?: () => void;
  onEdit?: () => void;
  onUpdateQuantity: (foodId: string, q: string) => void;
  onUpdateUnit: (foodId: string, servingId: string | null) => void;
  // Blur-time commit: when the staged amount is left at 0 (or emptied), the row
  // is dropped from the plate. Optional — only the staging plate wires it.
  onCommitQuantity?: (foodId: string, q: string) => void;
}) {

  // A recipe is a `foods` row with source='recipe'; its View/Edit targets are the
  // recipe pages, not the library ones, so the menu labels follow suit.
  const isRecipe = food.source === "recipe";
  const hasMenu = Boolean(onView || onEdit);

  // STATE — the ⋮ actions popover. Portalled to <body> at fixed coords so the
  // scrolling logger body can't clip it; null position means closed.
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Close on outside pointer, Escape, or any scroll/resize — the fixed coords go
  // stale the moment the list moves under it, so dismissing beats re-measuring.
  useEffect(() => {
    if (!menuPosition) return;
    const close = () => setMenuPosition(null);
    // Ignore pointers landing on the menu itself (its own click must still fire —
    // React dispatches from the same document node, so stopPropagation there
    // would NOT hold this listener off) or on the ⋮, whose onClick toggles.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".fg-row-menu, [aria-haspopup='menu']")) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuPosition]);

  // Place the popover under the ⋮, right-aligned to it, flipping above when there
  // isn't room below in the visible viewport (the soft keyboard shrinks it).
  function openMenu(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const MENU_WIDTH = 160;
    const itemCount = (onView ? 1 : 0) + (onEdit ? 1 : 0);
    const estimatedHeight = itemCount * 38 + 10;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const openUp = rect.bottom + estimatedHeight + 8 > viewportHeight;
    setMenuPosition({
      top: openUp ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, viewportWidth - MENU_WIDTH - 8)),
    });
  }

  // Resolve the serving + quantity to display. On-plate: the live staged values.
  // Otherwise: last-logged amount on "Latest" rows, else the food's reference amount.
  const lastServing =
    food.last_serving_id != null
      ? food.servings.find((s) => s.id === food.last_serving_id) ?? null
      : null;
  const defaultServing = food.servings.find((s) => s.unit !== "g") ?? food.servings[0] ?? null;
  const entryServing = entry ? entry.food.servings.find((s) => s.id === entry.servingId) ?? null : null;
  const shownServing = inCollection ? entryServing : (lastServing ?? defaultServing);
  const shownQuantity = inCollection
    ? parseAmount(entry?.quantity)
    : lastServing && food.last_quantity != null
      ? food.last_quantity
      : Number(shownServing?.units_per_serving) || 1;
  const servingLabel = shownServing
    ? `${fmtAmount(Number.isFinite(shownQuantity) ? shownQuantity : 1)} ${shownServing.unit}`
    : inCollection ? `${fmtAmount(Number.isFinite(shownQuantity) ? shownQuantity : 1)}` : "1 serving";

  // Macro numbers always scale to the SHOWN amount so they match the serving label
  // above (servings_eaten = shownQuantity / units_per_serving). On the plate that's
  // the live staged amount; off the plate it's the last-logged amount on "Latest"
  // rows (so a food last logged at 2 servings shows 2 servings of macros, not 1) and
  // the food's reference amount everywhere else (which resolves back to 1 serving).
  const ups = shownServing ? Number(shownServing.units_per_serving) : 0;
  const servingsEaten =
    ups > 0 && Number.isFinite(shownQuantity) && shownQuantity > 0
      ? shownQuantity / ups
      : 1;
  const mKcal = Math.round((Number(food.kcal_per_serving) || 0) * servingsEaten);
  const mP = Math.round((Number(food.protein_g_per_serving) || 0) * servingsEaten);
  const mF = Math.round((Number(food.fat_g_per_serving) || 0) * servingsEaten);
  const mC = Math.round((Number(food.carbs_g_per_serving) || 0) * servingsEaten);

  return (
    /* RECORD ROW WRAP — top row + (when on the plate) the on-plate accent */
    <div className={`list-row-wrap${inCollection ? " on-plate" : ""}`}>

      {/* TOP ROW — avatar/title/meta + amount control */}
      <div className="list-row" style={{ cursor: "default" }}>

      {/* ROW BODY — avatar + title + meta; tap to open the details sheet */}
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Details for ${food.name}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          color: "inherit",
          cursor: "pointer",
        }}
      >

        {/* FOOD AVATAR */}
        <FoodAvatar food={food} size={16} />

        {/* TITLE + META */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* TITLE — name + optional brand */}
          <div className="list-row-title">
            {food.name}
            {food.brand && <span style={{ color: "var(--color-gray)", fontWeight: 500 }}> By {food.brand}</span>}
          </div>

          {/* META — kcal flame, P/F/C, • serving. Macros scale live once on the plate;
              the serving label is dropped there since the qty chip/editor shows it. */}
          <div className="list-row-meta">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.125rem" }}>
              {mKcal}
              <Flame size={11} style={{ color: "var(--fg-cal)" }} />
            </span>
            <span style={{ color: "var(--fg-protein)" }}>{mP}P</span>
            <span style={{ color: "var(--fg-fat)" }}>{mF}F</span>
            <span style={{ color: "var(--fg-carb)" }}>{mC}C</span>
            {!inCollection && <span style={{ color: "var(--color-gray)" }}>• {servingLabel}</span>}
          </div>
        </div>
      </button>

      {/* ACTIONS MENU BUTTON — ⋮ → View / Edit the backing food or recipe. Replaces
          the old ⓘ, which only duplicated the row-body tap (both opened the
          details sheet); tapping the row still opens that sheet. */}
      {hasMenu && (
        <Button
          className="btn-link fg-row-icon"
          onClick={(e) => {
            e.stopPropagation();
            if (menuPosition) {
              setMenuPosition(null);
              return;
            }
            openMenu(e.currentTarget);
          }}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuPosition)}
          aria-label={`Actions for ${food.name}`}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      )}

      {/* ADD → INLINE QTY/UNIT — before adding this is a + button; on add it is
          replaced in place (inline with the row) by a typeable amount + unit select
          (no stepper buttons). Removal lives in the plate panel. */}
      {inCollection && entry ? (

        /* INLINE AMOUNT EDITOR — animates in where the + button was */
        <div className="fg-inline-qty">

          {/* AMOUNT INPUT — fraction-capable ("1/8"); see AmountField */}
          <AmountField
            className="input-field fg-inline-amt"
            value={entry.quantity}
            onValueChange={(next) => onUpdateQuantity(entry.food.id, next)}
            onBlur={(e) => onCommitQuantity?.(entry.food.id, e.target.value)}
            onFocus={selectOnFocus}
            aria-label="Amount"
          />

          {/* UNIT SELECT */}
          <select
            className="input-field fg-inline-unit"
            value={entry.servingId ?? ""}
            onChange={(e) => onUpdateUnit(entry.food.id, e.target.value || null)}
            aria-label="Unit"
          >
            {entry.food.servings.length === 0 && <option value="" disabled>—</option>}
            <ServingUnitOptions servings={entry.food.servings} />
          </select>
        </div>
      ) : (
        onAdd && (

          /* ADD BUTTON — commits 1 default serving, then morphs into the editor above */
          <Button
            className="btn-link fg-row-icon"
            onClick={onAdd}
            aria-label="Add to plate"
          >
            <Plus className="w-4 h-4" />
          </Button>
        )
      )}
      </div>

      {/* ROW ACTIONS MENU — portalled to <body> so the logger's scrolling body
          neither clips it nor scrolls for it. Dismissal is handled by the
          document pointerdown listener above, which skips .fg-row-menu. */}
      {menuPosition && typeof document !== "undefined" && createPortal(
        <div
          className="fg-row-menu"
          role="menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >

          {/* VIEW — the food's library page, or the recipe's own page */}
          {onView && (
            <button
              type="button"
              role="menuitem"
              className="fg-row-menu-item"
              onClick={() => {
                setMenuPosition(null);
                onView();
              }}
            >
              <Info size={14} /> {isRecipe ? "View recipe" : "View food"}
            </button>
          )}

          {/* EDIT — same page, landing straight in its edit mode */}
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              className="fg-row-menu-item"
              onClick={() => {
                setMenuPosition(null);
                onEdit();
              }}
            >
              {isRecipe ? <BookOpen size={14} /> : <Pencil size={14} />}{" "}
              {isRecipe ? "Edit recipe" : "Edit food"}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
