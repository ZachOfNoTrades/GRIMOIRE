"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Search, ScanBarcode, Scale, Quote, ChefHat, CalendarRange,
  CookingPot, Sandwich, SlidersHorizontal, X, ChevronRight,
} from "lucide-react";
import Modal from "@/components/Modal";
import { AddEntryModal, nowHHMM, todayIso } from "./_diary";
import { FoodEntry } from "../types/entry";
import LogWeighInModal from "./strategy/LogWeighInModal";
import ForageTabBar, { type ForageTab } from "./ForageTabBar";
import RecipeBuildPicker from "./recipes/RecipeBuildPicker";
import { useRecipeBuilder } from "./recipes/useRecipeBuilder";
import "./ForageTabBar.css";

/* ─── FORAGE BOTTOM BAR ───
   The single, self-contained bottom navigation for every forage screen:
   an optional search pill + the shared tab bar, plus the entire quick-add flow
   the center (+) FAB drives — the Shortcuts sheet and the modals it opens
   (add-entry, weigh-in). Extracted from the dashboard so the (+) behaves
   IDENTICALLY everywhere (it used to open the Shortcuts sheet on the dashboard
   but deep-link to the food log elsewhere).

   Pages pass `date` (where entries are logged) and refresh callbacks so the host
   can update after a log/weigh-in:
     - onLogged   — a food entry was saved
     - onWeighIn  — a weigh-in was saved or deleted
   `showSearch` renders the search pill above the bar (dashboard + food log). */

export default function ForageBottomBar({
  active,
  showSearch = false,
  date,
  onLogged,
  onWeighIn,
  initialStrategyAlert = false,
  checkinRefreshKey = 0,
}: {
  active: ForageTab;
  showSearch?: boolean;
  date?: string;
  /* Receives the freshly-logged, hydrated entries so the host can paint them
     optimistically (handed off to the diary timeline) before its refetch lands. */
  onLogged?: (created?: FoodEntry[]) => void;
  onWeighIn?: () => void;
  /* Seed for the Strategy tab's check-in due-dot, so a host that already knows
     the state (dashboard SSR) paints it without a first-render flash. The bar
     also fetches it read-only on mount, so pages that don't pass it still get it. */
  initialStrategyAlert?: boolean;
  /* Bump to force the due-dot to re-fetch without changing tabs — the strategy
     page bumps this after a check-in completes so the dot clears in place
     (completing the wizard doesn't switch tabs, so the mount/active fetch below
     would otherwise never re-run). */
  checkinRefreshKey?: number;
}) {
  const router = useRouter();

  // DATA — whether the coached program's weekly check-in is due, surfaced as a
  // dot on the Strategy tab. Read-only fetch (never runs the lazy recompute, so
  // painting the dot can't mark the check-in done). Seeded from props when the
  // host already knows, then refreshed on mount.
  const [strategyDue, setStrategyDue] = useState<boolean>(initialStrategyAlert);

  // STATE — the quick-add surfaces, owned here so every page shares them.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [weighInOpen, setWeighInOpen] = useState(false);
  const [addPicker, setAddPicker] = useState<"search" | "scan" | "quick" | null>(null);
  // Recipe creation — shared with the Recipes page and the food logger's Recipes
  // tab so every entry point offers the identical build-method flow.
  const recipeBuilder = useRecipeBuilder();
  // Autohide: the search pill collapses on scroll-down and reveals on scroll-up
  // / near the top, mirroring the global navbar. (Only the pill — the tab bar
  // stays put.) `searchHidden` drives the CSS; `searchHiddenRef` mirrors it so
  // the scroll listener reads the live value without re-subscribing, and
  // `searchSlotHeight` is the measured natural height we collapse to 0.
  const [searchHidden, setSearchHidden] = useState(false);
  const searchHiddenRef = useRef(false);
  const searchSlotRef = useRef<HTMLDivElement>(null);
  const [searchSlotHeight, setSearchSlotHeight] = useState(0);

  // Refresh the Strategy check-in due-dot on mount (and when the active tab
  // changes — navigating to/from Strategy can clear it once the recompute runs),
  // plus whenever the host bumps checkinRefreshKey (a check-in just completed
  // in place, without a tab change). Read-only endpoint, so this never marks the
  // check-in as done.
  useEffect(() => {
    let alive = true;
    fetch("/modules/forage/api/checkin-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data) setStrategyDue(!!data.due); })
      .catch(() => { /* non-critical — leave the seeded value */ });
    return () => { alive = false; };
  }, [active, checkinRefreshKey]);

  // Measure the pill slot once it's shown, and reset to revealed whenever the
  // search pill (re)appears — e.g. when bulk-select clears `showSearch` and back.
  useEffect(() => {
    if (!showSearch) return;
    if (searchSlotRef.current) setSearchSlotHeight(searchSlotRef.current.offsetHeight);
    searchHiddenRef.current = false;
    setSearchHidden(false);
  }, [showSearch]);

  // Autohide on scroll — same CAPTURE-phase document listener the navbar uses so
  // it catches scrolls from BOTH the window and the inner `.page-scroll` /
  // app-shell scroll regions (where the window never scrolls). Collapsing the
  // slot reflows the bottom bar, which on a list scrolled to its bottom clamps
  // scrollTop and fires a synthetic scroll event — the oscillation the old
  // in-flow search bar suffered. `suppressUntil` ignores scroll events for the
  // collapse transition window so that self-inflicted scroll can't flip it back.
  //
  // The pill also stays STATIC whenever the page can't meaningfully scroll. A
  // short day — e.g. one whose only entry is late (11 PM), so the timeline's
  // leading empty hours collapse and it shrinks below the viewport — fires no
  // scroll event, so a pill left collapsed by an earlier scroll could otherwise
  // never be revealed again. Two guards: (1) refuse to hide unless hiding would
  // still leave the page scrollable, and (2) watch the scroll region's height and
  // re-reveal the instant it stops overflowing.
  useEffect(() => {
    if (!showSearch) return;

    // The scroll region is a sibling of this bar inside the forage shell. Its
    // class differs per shell (`.page-scroll` on the food log / nutrition; an
    // inline overflow:auto div on the dashboard), so find it generically: the
    // shell's `.page-scroll` if present, else its first vertically-scrollable
    // descendant.
    const shell = searchSlotRef.current?.closest<HTMLElement>(".page-with-bottom-bar, .forage-shell");
    const scroller: HTMLElement | null =
      shell?.querySelector<HTMLElement>(".page-scroll") ??
      (shell
        ? Array.from(shell.querySelectorAll<HTMLElement>("*")).find((el) => {
            const overflowY = getComputedStyle(el).overflowY;
            return overflowY === "auto" || overflowY === "scroll";
          }) ?? null
        : null);

    let lastY = 0;
    let suppressUntil = 0;

    // The pill's collapse only buys back its own height of scroll room, so hiding
    // it on a page that overflows by less than that would erase the scroll
    // entirely and strand the (now hidden) pill — only hide when real room remains.
    function canHide(): boolean {
      if (!scroller) return true; // window-scrolled pages: keep prior behaviour
      const slot = searchSlotHeight || 64;
      return scroller.scrollHeight - scroller.clientHeight > slot;
    }

    function handleScroll(event: Event) {
      const target = event.target as (Document | HTMLElement | null);

      // Ignore scrolls inside an open nav/drawer overlay — its inner scrolling
      // isn't page scroll and must not toggle the pill behind it.
      if (target instanceof HTMLElement && target.closest(".forage-drawer-backdrop")) {
        return;
      }

      const currentY =
        !target || target === document || target === document.documentElement || target === document.body
          ? window.scrollY
          : (target as HTMLElement).scrollTop ?? 0;

      const now = performance.now();
      if (now < suppressUntil) {
        lastY = currentY; // keep the baseline current; don't react to our own reflow
        return;
      }

      let next = searchHiddenRef.current;
      if (currentY < 48) {
        next = false; // always show near the top
      } else if (currentY > lastY + 4 && canHide()) {
        next = true; // scrolling down, and hiding still leaves the page scrollable
      } else if (currentY < lastY - 4) {
        next = false; // scrolling up
      }
      lastY = currentY;

      if (next !== searchHiddenRef.current) {
        searchHiddenRef.current = next;
        setSearchHidden(next);
        suppressUntil = now + 260; // cover the 200ms collapse transition
      }
    }

    // Re-reveal as soon as the scroll region stops overflowing — covers a pill
    // that was already collapsed when the content shrank (or when arriving on a
    // short day), where no scroll event would ever fire to bring it back.
    function revealIfUnscrollable() {
      if (!scroller) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 2 && searchHiddenRef.current) {
        searchHiddenRef.current = false;
        setSearchHidden(false);
      }
    }

    revealIfUnscrollable();
    let overflowObserver: ResizeObserver | null = null;
    if (scroller && typeof ResizeObserver !== "undefined") {
      overflowObserver = new ResizeObserver(revealIfUnscrollable);
      overflowObserver.observe(scroller);
      // The scroller's own box doesn't change when its content reflows, so also
      // observe the content wrapper whose height tracks the timeline.
      if (scroller.firstElementChild) overflowObserver.observe(scroller.firstElementChild);
    }

    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", handleScroll, { capture: true });
      overflowObserver?.disconnect();
    };
  }, [showSearch, searchSlotHeight]);


  return (
    <>
      {/* SEARCH PILL — opens the add-entry modal on the search / scan tab.
          Autohides on scroll: collapses the slot height to 0 (reclaiming its
          space so the tab bar drops to the bottom edge) and slides/fades the
          pill out. `searchSlotHeight` is the measured natural height; height is
          left `undefined` (auto) when shown so the first paint can be measured.
          `aria-hidden` + pointer-events keep the hidden pill out of the a11y
          tree and untappable. */}
      {showSearch && (
        /* SEARCH PILL SLOT */
        <div
          ref={searchSlotRef}
          className="fg-searchpill-slot"
          aria-hidden={searchHidden}
          style={{
            height: searchHidden ? 0 : (searchSlotHeight || undefined),
            paddingTop: searchHidden ? 0 : undefined,
            paddingBottom: searchHidden ? 0 : undefined,
            overflow: "hidden",
            transition: "height 200ms ease, padding 200ms ease",
          }}
        >
          <div
            className="fg-searchpill"
            style={{
              opacity: searchHidden ? 0 : 1,
              transform: searchHidden ? "translateY(8px)" : "translateY(0)",
              pointerEvents: searchHidden ? "none" : "auto",
              transition: "opacity 200ms ease, transform 200ms ease, background-color 140ms ease",
            }}
          >
            <Search size={18} className="fg-searchpill-icon" />
            <button type="button" className="fg-searchpill-text" onClick={() => setAddPicker("search")}>
              Search for a food
            </button>
            <button type="button" className="fg-searchpill-scan" aria-label="Scan barcode" onClick={() => setAddPicker("scan")}>
              <ScanBarcode size={20} />
            </button>
          </div>
        </div>
      )}

      {/* TAB BAR — FAB opens the Shortcuts sheet (identical on every page).
          strategyAlert dots the Strategy icon when the weekly check-in is due. */}
      <ForageTabBar active={active} strategyAlert={strategyDue} onAdd={() => setShortcutsOpen(true)} />

      {/* ADD-ENTRY MODAL — logs to `date` (defaults to today); refresh on save. */}
      {addPicker && (
        <AddEntryModal
          date={date ?? todayIso()}
          mode="create"
          defaultTime={nowHHMM()}
          initialPicker={addPicker}
          editingEntry={null}
          onClose={() => setAddPicker(null)}
          onSaved={(created) => {
            setAddPicker(null);
            // After logging food from any screen, land the user on the food log
            // timeline (on the day the entry was logged) so they see what they
            // just added. When already on the timeline, just refresh in place
            // (handing off the new rows for an optimistic paint); navigating to
            // the same route would needlessly reset its state.
            if (active === "foodlog") {
              onLogged?.(created);
            } else {
              router.push(`/modules/forage/ui/foods?date=${date ?? todayIso()}`);
            }
          }}
        />
      )}

      {/* SHORTCUTS SHEET — the (+) quick-add hub. */}
      {shortcutsOpen && (
        <ShortcutsSheet
          onClose={() => setShortcutsOpen(false)}
          onWeight={() => { setShortcutsOpen(false); setWeighInOpen(true); }}
          onSearch={() => { setShortcutsOpen(false); setAddPicker("search"); }}
          onBarcode={() => { setShortcutsOpen(false); setAddPicker("scan"); }}
          onDescribe={() => { setShortcutsOpen(false); setAddPicker("quick"); }}
          onRecipes={() => { setShortcutsOpen(false); router.push("/modules/forage/ui/recipes"); }}
          onEditDay={() => { setShortcutsOpen(false); toast("Edit Day isn't implemented yet"); }}
          onNewRecipe={() => { setShortcutsOpen(false); recipeBuilder.openPicker(); }}
          onNewFood={() => { setShortcutsOpen(false); router.push("/modules/forage/ui/library/new"); }}
          onCustomize={() => toast("Customizing shortcuts isn't implemented yet")}
        />
      )}

      {/* RECIPE BUILD PICKER — Shortcuts → New Recipe: choose scratch / URL / AI. */}
      {recipeBuilder.pickerOpen && <RecipeBuildPicker {...recipeBuilder.pickerProps} />}

      {/* WEIGH-IN MODAL — logs today's weight; refresh on save/delete. */}
      <LogWeighInModal
        isOpen={weighInOpen}
        editing={null}
        onClose={() => setWeighInOpen(false)}
        onSaved={() => { setWeighInOpen(false); onWeighIn?.(); }}
        onDeleted={() => { setWeighInOpen(false); onWeighIn?.(); }}
      />
    </>
  );
}

/* ─── SHORTCUTS SHEET — bottom action-sheet of quick-add destinations, modeled
   on MacroFactor's "Shortcuts" sheet. Top row holds the circular icon
   shortcuts; the list below holds the navigation rows. ─── */

function ShortcutsSheet({
  onClose, onWeight, onSearch, onBarcode, onDescribe, onRecipes, onEditDay, onNewRecipe, onNewFood, onCustomize,
}: {
  onClose: () => void;
  onWeight: () => void;
  onSearch: () => void;
  onBarcode: () => void;
  onDescribe: () => void;
  onRecipes: () => void;
  onEditDay: () => void;
  onNewRecipe: () => void;
  onNewFood: () => void;
  onCustomize: () => void;
}) {
  return (
    <Modal
      isOpen
      sheet
      onClose={onClose}
      title={
        /* HEADER — customize (sliders) left, centered title, close right. */
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <button type="button" onClick={onCustomize} aria-label="Customize shortcuts" style={{ display: "flex", background: "transparent", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", color: "var(--color-secondary)" }}>
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <span style={{ flex: 1, textAlign: "center" }}>Shortcuts</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ display: "flex", background: "transparent", border: "none", padding: 6, marginRight: -6, cursor: "pointer", color: "var(--color-primary)" }}>
            <X className="w-5 h-5" />
          </button>
        </span>
      }
      modalActions={<></>}
    >

      {/* CIRCULAR SHORTCUTS ROW */}
      <div style={{ display: "flex", gap: 8, padding: "4px 0 16px" }}>
        <ShortcutCircle icon={<Scale size={22} />} label="Weight" onClick={onWeight} />
        <ShortcutCircle icon={<Search size={22} />} label="Search" onClick={onSearch} />
        <ShortcutCircle icon={<ScanBarcode size={22} />} label="Barcode" onClick={onBarcode} />
        <ShortcutCircle icon={<Quote size={22} />} label="Describe" onClick={onDescribe} />
      </div>

      {/* NAVIGATION ROWS */}
      <div>
        <ShortcutRow icon={<ChefHat size={20} />} label="Recipes" onClick={onRecipes} />
        <ShortcutRow icon={<CalendarRange size={20} />} label="Edit Day" onClick={onEditDay} />
        <ShortcutRow icon={<CookingPot size={20} />} label="New Recipe" onClick={onNewRecipe} />
        <ShortcutRow icon={<Sandwich size={20} />} label="New Food" onClick={onNewFood} />
      </div>
    </Modal>
  );
}

function ShortcutCircle({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    /* SHORTCUT CIRCLE — round icon button + label, evenly sharing the row. */
    <button
      type="button"
      onClick={onClick}
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-primary)" }}
    >
      <span style={{ width: 56, height: 56, borderRadius: 999, background: "var(--hover-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function ShortcutRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    /* SHORTCUT ROW — full-width nav row with leading icon + trailing chevron. */
    <button
      type="button"
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "15px 2px", background: "transparent", border: "none", borderTop: "1px solid var(--card-border)", cursor: "pointer", color: "var(--color-primary)", textAlign: "left" }}
    >
      <span style={{ display: "flex", color: "var(--color-primary)" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{label}</span>
      <ChevronRight size={18} style={{ color: "var(--color-secondary)" }} />
    </button>
  );
}
