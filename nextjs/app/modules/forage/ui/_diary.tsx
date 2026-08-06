"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Plus,
  Trash2,
  Search,
  X,
  Copy,
  Pencil,
  Clock,
  Flame,
  MoreHorizontal,
  MoreVertical,
  Camera,
  ScanBarcode,
  ScanText,
  Package,
  AlertTriangle,
  Sparkles,
  Zap,
  BookOpen,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  Check,
  Split,
  CalendarClock,
  Replace,
  ArrowDownUp,
  Link as LinkIcon,
  Download,
  ExternalLink,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import SegmentedToggle from "@/components/ui/SegmentedToggle";
import { FoodEntry, DailyTotals } from "../types/entry";
import { Food, FoodNutrient, FoodServing, FoodUsageStats, Nutrient, ResolvedNutrientTarget } from "../types/food";
import { Recipe, RecipeIngredient, FoodWithIngredients } from "../types/recipe";
import { NUTRIENT_BUCKETS } from "../utils/nutrientGroups";
import {
  LABEL_ESSENTIAL_CODES as LEDGER_LABEL_ESSENTIAL_CODES,
  MACRO_BY_KEY,
  FDA_LABEL_SCHEME,
  resolveScheme,
  type ResolvedItem,
  sectionColor,
  byNutrientOrder,
} from "../utils/nutrientLedger";
import { LabelOcrDraft } from "../types/labelOcr";

// One Open Food Facts search suggestion, as returned by the module's
// /api/foods/openfoodfacts lane (mirrors OpenFoodFactsSuggestion server-side).
type OffSuggestion = {
  code: string;
  name: string;
  brand: string;
  quantity: string | null;
  kcal_per_100: number | null;
};
import { FOOD_ICONS, resolveFoodIcon } from "../lib/foodIcons";
import { FoodAvatar } from "../components/FoodAvatar";
import { LiveBarcodeScanner } from "../components/LiveBarcodeScanner";
import { FoodRecordRow } from "../components/FoodRecordRow";
import { NutrientMeter, bandDisplay, fmtNutrient, ProgramTargetMark, isProgramTarget, type NutrientBand } from "./nutrition/nutrientMeter";
import { withVirtualUnits, resolveServingForSave } from "../lib/virtualUnits";
import { selectOnFocus, blurOnEnter, focusOnEnter, useBlurActiveInputOnScroll } from "@/lib/inputBehavior";
import { fmtAmount } from "../lib/format";
import "./foodDetail.css";

// Ephemeral "quick add" food (id prefixed `quick:`) built from raw macros so it can
// ride the normal plate/collection + inline-stepper machinery. It is never persisted
// — handleSave detects the prefix and logs it as a quick-add entry (food_id null).
// kcal/macros are PER UNIT (1 serving = 1 unit), so the plate quantity multiplies them.
const QUICK_PREFIX = "quick:";

// How many "frequently paired with" records the logger injects under a food it has
// just staged. Small on purpose — these rows push the real search results down, so
// they read as a nudge rather than a second list.
const PAIRED_SUGGESTION_LIMIT = 3;

function makeQuickFood(
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number
): Food {
  const id = `${QUICK_PREFIX}${crypto.randomUUID()}`;
  return {
    id,
    user_id: null,
    name,
    brand: null,
    source: "generic",
    usda_fdc_id: null,
    barcode_upc: null,
    source_url: null,
    // A quick-add food is a throwaway macro entry — it never has a photo.
    image_updated_at: null,
    kcal_per_serving: kcal,
    protein_g_per_serving: protein,
    carbs_g_per_serving: carbs,
    fat_g_per_serving: fat,
    is_favorite: false,
    is_archived: false,
    icon: null,
    servings: [{ id: `${id}:serving`, food_id: id, unit: "serving", units_per_serving: 1 }],
    nutrients: [],
  };
}

// Selectable units come from the food_units DB table via /api/units.
// The canonical "serving" is implicit (server-injected) and never appears here.
interface UnitOption {
  id: string;
  name: string;
}

/* ============================================================
   DATE HELPERS
   ============================================================ */

export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

export function dateRelativeLabel(iso: string): { primary: string; secondary: string } {
  const t = todayIso();
  const y = shiftDate(t, -1);
  const tm = shiftDate(t, 1);
  const d = isoToDate(iso);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayMonth = `${weekdayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
  let primary = dayMonth;
  if (iso === t) primary = "Today";
  else if (iso === y) primary = "Yesterday";
  else if (iso === tm) primary = "Tomorrow";
  return { primary, secondary: iso === t || iso === y || iso === tm ? dayMonth : "" };
}

export function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  // Compact on-the-hour label: "1AM" instead of "1:00 AM" for timeline hour sections.
  return `${h12}${period}`;
}

export function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

// MacroFactor-style: drop the minutes when the user is on the top of an hour
// so the pill reads "10 AM" instead of "10:00 AM".
export function formatTimePill(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${mStr} ${period}`;
}

// selectOnFocus now lives in @/lib/inputBehavior (shared across modules); it is
// re-exported here so existing relative importers keep working.
export { selectOnFocus };

export function weekStartFor(iso: string): string {
  // ISO week: Monday as first day. Sunday (getDay()===0) maps to offset 6.
  const d = isoToDate(iso);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ============================================================
   TIMELINE — fetches entries for a date and renders hour groups + add/edit modal
   ============================================================ */

// Snapshot of bulk-selection state shipped up to the parent so it can render
// the bulk-action UI in its own bottom-action-bar slot. null = no selection.
export type DiaryBulkActions = {
  count: number;
  // Total selectable entries on the day, so the bar can offer a select-all toggle.
  total: number;
  allSelected: boolean;
  isDeleting: boolean;
  // True while ANY bulk operation (delete / move / copy) is in flight, so the bar
  // can disable every action button. isDeleting stays delete-specific (drives the
  // "Deleting…" label) so a move/copy doesn't relabel the delete button.
  isBusy: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  // Open the bulk move modal (relocate every selected entry to a chosen date/time).
  onMove: () => void;
  // Open the bulk copy modal (duplicate every selected entry to a chosen date/time).
  onCopy: () => void;
};

// Build the POST body that recreates a logged entry as a brand-new log at a target
// date/time. Shared by single-entry "Copy to…" and bulk copy. Food-backed entries
// copy by food_id + serving_id; quick-adds copy via their per-unit macros (the
// create route multiplies these back out by quantity), mirroring handleDuplicate.
function entryCreateBody(e: FoodEntry, target: { entry_date: string; entry_time: string }) {
  const body: Record<string, unknown> = {
    entry_date: target.entry_date,
    entry_time: target.entry_time,
    quantity: e.quantity,
  };
  if (e.food_id) {
    body.food_id = e.food_id;
    body.serving_id = e.serving_id;
  } else {
    body.quick_add_name = e.quick_add_name;
    body.quick_add_kcal = e.kcal / e.quantity;
    body.quick_add_protein_g = e.protein_g / e.quantity;
    body.quick_add_carbs_g = e.carbs_g / e.quantity;
    body.quick_add_fat_g = e.fat_g / e.quantity;
  }
  return body;
}

export function DiaryTimeline({
  date,
  openAddSignal,
  addInitialPicker,
  reloadSignal,
  insertEntries,
  onInserted,
  onChange,
  onTotals,
  onBulkActions,
}: {
  date: string;
  openAddSignal?: number;
  addInitialPicker?: "scan" | "search" | "recipes" | "quick" | "add";
  /* Bumped by the parent to force a refetch (e.g. after an entry is logged from
     a sibling component like ForageBottomBar). */
  reloadSignal?: number;
  /* Entries just logged from a sibling component (ForageBottomBar) to paint
     immediately — optimistic insert before the reloadSignal refetch reconciles. */
  insertEntries?: FoodEntry[] | null;
  /* Called once the insertEntries have been consumed, so the parent can clear them. */
  onInserted?: () => void;
  onChange?: () => void;
  /* Emits the viewed day's running macro/micro totals (summed from the live
     `entries` state) whenever they change — so the parent's mini-dashboard
     (calorie rings + macro bars) can update OPTIMISTICALLY alongside the
     timeline, instead of waiting on the reloadSignal week refetch. Tagged with
     `date` so a stale emit from the previous day is ignored after a date change. */
  onTotals?: (payload: { date: string; totals: DailyTotals }) => void;
  /* Called whenever the bulk-selection state changes. Parent renders the
     returned actions into its own bottom-action-bar (or wherever). */
  onBulkActions?: (actions: DiaryBulkActions | null) => void;
}) {
  const router = useRouter();

  // DATA
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  // The day the current `entries` were actually loaded for. On a date change the
  // `date` prop flips a render before `refresh()` swaps `entries`/`isLoading`, so
  // this lets us hold back a totals emit until `entries` genuinely belong to the
  // viewed day (see the OPTIMISTIC DAY TOTALS emit below).
  const [loadedDate, setLoadedDate] = useState(date);
  // Monotonic token for the timeline load below. Every refresh() bumps it, so a
  // response can check whether it is still the newest request before it writes
  // any state. Without this, opening the page and stepping to another day BEFORE
  // the first load lands lets that slow first response resolve LAST and overwrite
  // the newly-viewed day's rows with the previous day's (usually empty) ones —
  // the timeline blanks out even though the day has entries.
  const requestSequence = useRef(0);
  // The in-flight load's abort handle, so a superseded request is cancelled
  // outright rather than left to burn a connection + DB round-trip.
  const inFlightRequest = useRef<AbortController | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [editorState, setEditorState] = useState<
    | {
        mode: "create";
        defaultTime: string;
        initialPicker?: "scan" | "search" | "recipes" | "quick" | "add";
      }
    | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editFoodId, setEditFoodId] = useState<string | null>(null);
  // The entry currently being relocated to a different date/time (Move modal open).
  const [moveEntry, setMoveEntry] = useState<FoodEntry | null>(null);
  // The entry currently being copied to a different date/time (Copy modal open).
  const [copyEntry, setCopyEntry] = useState<FoodEntry | null>(null);
  // The entry whose backing food is being swapped (Replace modal open).
  const [replaceEntry, setReplaceEntry] = useState<FoodEntry | null>(null);
  // Open bulk relocate modal for the current selection: "move" relocates the
  // selected entries, "copy" duplicates them. null = no bulk relocate in progress.
  const [bulkMode, setBulkMode] = useState<"move" | "copy" | null>(null);
  const [isBulkRelocating, setIsBulkRelocating] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleHourSelect(ids: string[]) {
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    // OPTIMISTIC — drop the selected rows immediately; snapshot for rollback.
    const previous = entries;
    const idSet = new Set(ids);
    setEntries((cur) => cur.filter((e) => !idSet.has(e.id)));
    setSelectedIds(new Set());
    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`/modules/forage/api/entries/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        toast.success(`${ids.length} ${ids.length === 1 ? "entry" : "entries"} removed`);
      } else {
        toast.error(`Failed to delete ${failed} of ${ids.length}`);
        setEntries(previous); // rollback — re-sync below settles the partial result
      }
      // Reconcile silently against the server (covers partial failures too).
      refresh({ silent: true });
      onChange?.();
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function handleEditEntry(
    id: string,
    patch: { quantity: number; serving_id?: string | null }
  ) {
    const res = await fetch(`/modules/forage/api/entries/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Failed to update");
      return;
    }
    const data = await res.json().catch(() => null);
    const updated: FoodEntry | undefined = data?.entry;
    if (updated) {
      // In-place patch — preserves scroll position, prevents the timeline flicker.
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    }
    toast.success("Updated");
    onChange?.();
  }

  // Relocate an entry to a new date and/or time. The PUT route already accepts
  // entry_date + entry_time, so this just sends them. When the target date differs
  // from the day in view the entry leaves this timeline, so we always refresh()
  // rather than patch in place (an in-place patch would leave a stale chip on a
  // day the entry no longer belongs to).
  async function handleMoveEntry(id: string, target: { entry_date: string; entry_time: string }) {
    const res = await fetch(`/modules/forage/api/entries/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(target),
    });
    if (!res.ok) {
      toast.error("Failed to move");
      return;
    }
    const moved = target.entry_date !== date;
    toast.success(moved ? `Moved to ${dateRelativeLabel(target.entry_date).primary}` : "Moved");
    refresh({ silent: true });
    onChange?.();
  }

  // Copy a single entry to a chosen date/time — POSTs a fresh log (leaving the
  // original in place) at the target. Reuses entryCreateBody so quick-adds and
  // food-backed entries copy identically to the duplicate flow.
  async function handleCopyEntry(e: FoodEntry, target: { entry_date: string; entry_time: string }) {
    const res = await fetch(`/modules/forage/api/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entryCreateBody(e, target)),
    });
    if (!res.ok) {
      toast.error("Failed to copy");
      return;
    }
    const copiedAway = target.entry_date !== date;
    toast.success(copiedAway ? `Copied to ${dateRelativeLabel(target.entry_date).primary}` : "Copied");
    refresh({ silent: true });
    onChange?.();
  }

  // Relocate every selected entry in one go. mode "move" PUTs each entry to the
  // target date (and, when a uniform time is given, that time); mode "copy" POSTs
  // a fresh log per entry. target.entry_time === null means "keep each entry's own
  // time of day" (the common case for a whole-day move/copy) — so a day-shift never
  // collapses a meal's individual timestamps.
  async function handleBulkRelocate(
    mode: "move" | "copy",
    target: { entry_date: string; entry_time: string | null }
  ) {
    const selected = entries.filter((e) => selectedIds.has(e.id));
    if (selected.length === 0) return;
    setIsBulkRelocating(true);
    try {
      const results = await Promise.all(
        selected.map((e) => {
          if (mode === "move") {
            // Only send entry_time when a uniform time was chosen; otherwise the
            // entry keeps its existing time (PUT leaves omitted fields untouched).
            const patch: Record<string, unknown> = { entry_date: target.entry_date };
            if (target.entry_time) patch.entry_time = target.entry_time;
            return fetch(`/modules/forage/api/entries/${e.id}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(patch),
            });
          }
          return fetch(`/modules/forage/api/entries`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              entryCreateBody(e, {
                entry_date: target.entry_date,
                entry_time: target.entry_time ?? e.entry_time,
              })
            ),
          });
        })
      );
      const failed = results.filter((r) => !r.ok).length;
      const noun = selected.length === 1 ? "entry" : "entries";
      const verb = mode === "move" ? "moved" : "copied";
      if (failed === 0) {
        const where = target.entry_date !== date ? ` to ${dateRelativeLabel(target.entry_date).primary}` : "";
        toast.success(`${selected.length} ${noun} ${verb}${where}`);
      } else {
        toast.error(`Failed to ${mode} ${failed} of ${selected.length}`);
      }
      setSelectedIds(new Set());
      refresh({ silent: true });
      onChange?.();
    } finally {
      setIsBulkRelocating(false);
    }
  }

  const entriesByHour = useMemo(() => {
    const map = new Map<number, FoodEntry[]>();
    for (let h = 0; h < 24; h++) map.set(h, []);
    for (const e of entries) {
      const hour = Number(e.entry_time.split(":")[0]);
      map.get(hour)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([hour, list]) => ({ hour, entries: list }));
  }, [entries]);

  // Build the ordered list of hour rows to render, hiding empty hours that fall
  // before the day's last logged hour. Rules:
  //   - An empty hour STRICTLY BEFORE the last logged hour is dropped entirely.
  //   - Hours after the last log stay shown (the still-loggable tail of the day).
  //   - A day with nothing logged shows every hour (lastLoggedHour = -1).
  const timelineRows = useMemo(() => {
    const lastLoggedHour = entriesByHour.reduce(
      (last, { hour, entries: list }) => (list.length > 0 ? hour : last),
      -1
    );
    return entriesByHour.filter(
      ({ hour, entries: list }) => !(list.length === 0 && lastLoggedHour >= 0 && hour < lastLoggedHour)
    );
  }, [entriesByHour]);

  // FREQUENTLY-PAIRED SUGGESTIONS used to live here, as a chip strip pinned above
  // the day's latest timeline entry. They now belong to the food logger instead:
  // adding a food there injects its usual partners as real records directly under
  // it (see `pairedByAnchor` in AddEntryModal), which is where the user is already
  // deciding what to log. The timeline is history, not a picker.

  // OPTIMISTIC DAY TOTALS — sum the live `entries` (macros + micros) client-side,
  // mirroring the server's computeTotals so there's no drift. Because `entries`
  // is painted optimistically on log/edit/delete and reconciled by the silent
  // refresh, this recomputes the instant a row changes — letting the parent
  // mini-dashboard's rings/bars move with the timeline instead of lagging a
  // network round-trip behind it.
  const dayTotals = useMemo<DailyTotals>(() => {
    const totals: DailyTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };
    for (const e of entries) {
      totals.kcal += e.kcal;
      totals.protein_g += e.protein_g;
      totals.carbs_g += e.carbs_g;
      totals.fat_g += e.fat_g;
      if (e.micros) {
        for (const code in e.micros) {
          totals.micros[code] = (totals.micros[code] ?? 0) + e.micros[code];
        }
      }
    }
    return totals;
  }, [entries]);

  // Publish the running totals up, tagged with the day they belong to so a stale
  // emit can be discarded by the consumer. Held back while the initial/day-change
  // load is in flight — during that window `entries` still holds zero (fresh
  // mount) or the previous day's rows, which would flash wrong numbers onto the
  // new day's bars. The `loadedDate !== date` guard closes the one-render window
  // where a date change has flipped `date` but this effect runs before the
  // `[date]` refresh effect sets `isLoading` — without it we'd emit the previous
  // day's totals tagged with the NEW date, painting stale macros onto the new
  // day's rings/bars until the load lands. Optimistic inserts keep loadedDate ===
  // date (they only touch the current day), so they still emit.
  useEffect(() => {
    if (isLoading || loadedDate !== date) return;
    onTotals?.({ date, totals: dayTotals });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTotals, date, isLoading, loadedDate]);

  // Re-sync the timeline from the DB. `silent` skips the loading-spinner blank so
  // a post-mutation re-sync (log/delete/edit/move/copy) updates the list in place
  // — React diffs the rows, preserving scroll position instead of flashing the
  // whole timeline through a centered spinner. Only the genuine initial/day-change
  // load shows the spinner. Optimistic mutations below update state immediately,
  // then call this silently to reconcile against the server's source of truth.
  async function refresh({ silent = false }: { silent?: boolean } = {}) {
    // Claim the newest sequence number and cancel whatever is still in flight —
    // its result is already superseded by this one. `requestedDate` is captured
    // here so a response is always matched against the day it actually asked for.
    const sequence = ++requestSequence.current;
    const requestedDate = date;
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;

    if (!silent) setIsLoading(true);
    try {
      const r = await fetch(`/modules/forage/api/entries?date=${requestedDate}`, {
        signal: controller.signal,
      });
      const data = await r.json();
      // A newer load started while this one was in flight — drop this response
      // rather than painting a stale day over the one being viewed.
      if (sequence !== requestSequence.current) return;
      const list: FoodEntry[] = data.entries ?? [];
      setEntries(list);
      setLoadedDate(requestedDate); // entries now belong to this day — unblocks the totals emit

      // Warm caches so inline-edit shows the unit dropdown without a flicker.
      const foodIds = Array.from(new Set(list.map((e) => e.food_id).filter((id): id is string => !!id)));
      foodIds.forEach((id) => prefetchFoodServings(id));
    } catch (error) {
      // An abort (or any failure of a superseded request) is expected — the
      // newer load owns the UI now, so it must not raise a false error toast.
      if (sequence !== requestSequence.current) return;
      if ((error as Error | null)?.name === "AbortError") return;
      toast.error("Failed to load timeline");
    } finally {
      // Only the newest request clears the spinner. Clearing it unconditionally
      // would let a superseded load hide the spinner while the real one is still
      // running; skipping it entirely would strand the spinner when a silent
      // re-sync supersedes a day-change load.
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }

  // Paint freshly-logged entries into the timeline immediately (from the hydrated
  // POST response) so a new row appears without waiting on the reconciling refetch.
  // Dedups by id and ignores rows for other days, so a late silent refresh — or a
  // double signal — can never double the row up. `removeId` drops a replaced entry
  // in the same paint (used by the replace flow).
  function insertEntriesNow(created: FoodEntry[] | null | undefined, removeId?: string) {
    if (!created?.length && !removeId) return;
    setEntries((cur) => {
      const base = removeId ? cur.filter((e) => e.id !== removeId) : cur;
      const have = new Set(base.map((e) => e.id));
      const add = (created ?? []).filter((e) => e.entry_date === date && !have.has(e.id));
      return add.length || base.length !== cur.length ? [...base, ...add] : cur;
    });
  }

  // Optimistic insert of entries logged from the sibling bottom bar — paint them
  // immediately, then the silent reloadSignal refresh reconciles against the server.
  useEffect(() => {
    if (!insertEntries?.length) return;
    insertEntriesNow(insertEntries);
    onInserted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertEntries]);

  // Preload UOM + nutrient reference tables once on mount — both used by FoodModal +
  // (nutrients) by the daily nutrient panel below the macro widget.
  useEffect(() => {
    prefetchUnits();
    prefetchNutrients();
    prefetchNutrientTargets();
  }, []);

  useEffect(() => {
    refresh();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Parent-driven refetch (entry logged from a sibling bottom bar). Silent so
  // logging a food slots the new row into the timeline in place instead of
  // blanking it through the loading spinner.
  useEffect(() => {
    if (reloadSignal) refresh({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  // Publish bulk-selection state up so the parent can swap the bottom
  // action bar contents (search pill ↔ bulk-select). Null when nothing
  // is selected. Cleanup notifies parent to clear on unmount.
  useEffect(() => {
    if (!onBulkActions) return;
    if (selectedIds.size === 0) {
      onBulkActions(null);
      return;
    }
    onBulkActions({
      count: selectedIds.size,
      total: entries.length,
      allSelected: entries.length > 0 && selectedIds.size === entries.length,
      isDeleting: isBulkDeleting,
      isBusy: isBulkDeleting || isBulkRelocating,
      onClear: () => setSelectedIds(new Set()),
      // Toggle the whole day: select every entry, or clear if all are already on.
      onSelectAll: () =>
        setSelectedIds((prev) =>
          prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.id))
        ),
      onDelete: () => handleBulkDelete(),
      onMove: () => setBulkMode("move"),
      onCopy: () => setBulkMode("copy"),
    });
    return () => onBulkActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, isBulkDeleting, isBulkRelocating, entries]);

  // Open add modal when parent signals
  useEffect(() => {
    if (openAddSignal && openAddSignal > 0) {
      setEditorState({ mode: "create", defaultTime: nowHHMM(), initialPicker: addInitialPicker });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddSignal]);

  async function handleDeleteEntry(id: string) {
    // OPTIMISTIC — drop the row immediately so the timeline updates without
    // waiting on the round-trip; snapshot for rollback if the delete fails.
    const previous = entries;
    setEntries((cur) => cur.filter((e) => e.id !== id));
    const res = await fetch(`/modules/forage/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry removed");
      // Reconcile silently (totals/paired anchor) without re-blanking the list.
      refresh({ silent: true });
      onChange?.();
    } else {
      setEntries(previous); // rollback
      toast.error("Failed to delete");
    }
  }

  async function handleDuplicate(e: FoodEntry) {
    const body: any = { entry_date: e.entry_date, entry_time: e.entry_time, quantity: e.quantity };
    if (e.food_id) {
      body.food_id = e.food_id;
      body.serving_id = e.serving_id;
    } else {
      body.quick_add_name = e.quick_add_name;
      body.quick_add_kcal = e.kcal / e.quantity;
      body.quick_add_protein_g = e.protein_g / e.quantity;
      body.quick_add_carbs_g = e.carbs_g / e.quantity;
      body.quick_add_fat_g = e.fat_g / e.quantity;
    }
    const res = await fetch(`/modules/forage/api/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("Duplicated");
      refresh({ silent: true });
      onChange?.();
    } else toast.error("Failed");
  }

  // Explode a logged recipe entry into its component ingredients: replace the
  // single aggregated entry with one entry per resolved ingredient, scaled to
  // the logged portion (the entry logs `quantity` servings out of the recipe's
  // `serving_count` yield, so each ingredient's full-recipe amount is scaled by
  // quantity / serving_count). Placeholder ingredients (unresolved imports) and
  // any missing a serving can't become entries, so they're skipped.
  async function handleExplode(e: FoodEntry) {
    if (!e.food_id) return;
    const recipeRes = await fetch(`/modules/forage/api/recipes/${e.food_id}`);
    if (!recipeRes.ok) {
      toast.error("This entry isn't a recipe");
      return;
    }
    const recipe: { serving_count: number; ingredients: RecipeIngredient[] } = await recipeRes.json();
    const servingCount = Number(recipe.serving_count) || 1;
    const scale = e.quantity / servingCount;
    const resolved = (recipe.ingredients ?? []).filter((ing) => ing.ingredient_food_id && ing.serving_id);
    if (resolved.length === 0) {
      toast.error("No ingredients to explode");
      return;
    }

    // Log every ingredient at the recipe's date/time before touching the original.
    const results = await Promise.all(
      resolved.map((ing) =>
        fetch(`/modules/forage/api/entries`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entry_date: e.entry_date,
            entry_time: e.entry_time,
            food_id: ing.ingredient_food_id,
            serving_id: ing.serving_id,
            quantity: ing.quantity * scale,
          }),
        })
      )
    );
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      toast.error(`Exploded with ${failed} error${failed === 1 ? "" : "s"}`);
      refresh({ silent: true });
      onChange?.();
      return;
    }

    // All ingredients logged — drop the now-redundant recipe entry.
    await fetch(`/modules/forage/api/entries/${e.id}`, { method: "DELETE" });
    const skipped = (recipe.ingredients?.length ?? 0) - resolved.length;
    toast.success(
      `Exploded into ${resolved.length} item${resolved.length === 1 ? "" : "s"}` +
        (skipped > 0 ? ` · ${skipped} unresolved skipped` : "")
    );
    refresh({ silent: true });
    onChange?.();
  }

  return (
    /* TIMELINE CARD */
    <>
      <div className="card">

        {/* HEADER */}
        <div className="card-header">
          <h2 className="text-card-title">Timeline</h2>
          <span className="text-subtle">
            {/* Hold the subtitle blank while loading so the empty-state
                "Nothing logged" doesn't flash before the timeline arrives. */}
            {isLoading
              ? ""
              : entries.length === 0
              ? "Nothing logged"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
          </span>
        </div>

        {/* CONTENT */}
        {isLoading ? (
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* HOUR-GROUPED TIMELINE — logged hours + the post-log tail; empty
             hours before the last log are hidden */
          <div>
            {timelineRows.map(({ hour, entries: list }, i) => (
              <HourGroup
                key={hour}
                hour={hour}
                entries={list}
                first={i === 0}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleHourSelect={toggleHourSelect}
                onSaveEntry={handleEditEntry}
                onDelete={(id) => handleDeleteEntry(id)}
                onEditFood={(foodId) => setEditFoodId(foodId)}
                onEditRecipe={(foodId) => router.push(`/modules/forage/ui/recipes/${foodId}?edit=1`)}
                onViewFood={(foodId) => router.push(`/modules/forage/ui/library/${foodId}`)}
                onExplode={(entry) => handleExplode(entry)}
                onMove={(entry) => setMoveEntry(entry)}
                onCopy={(entry) => setCopyEntry(entry)}
                onReplace={(entry) => setReplaceEntry(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bulk-action UI now lives in the parent's .bottom-action-bar slot via
          the onBulkActions callback above. The .floating-action-bar CSS is
          preserved in globals.css for future use. */}

      {/* ADD MODAL */}
      {editorState?.mode === "create" && (
        <AddEntryModal
          date={date}
          mode="create"
          defaultTime={editorState.defaultTime}
          initialPicker={editorState.initialPicker}
          editingEntry={null}
          onClose={() => setEditorState(null)}
          onSaved={(created) => {
            setEditorState(null);
            // OPTIMISTIC — paint the new rows now; the silent refresh reconciles.
            insertEntriesNow(created);
            refresh({ silent: true });
            onChange?.();
          }}
        />
      )}

      {/* EDIT FOOD MODAL */}
      {editFoodId && (
        <FoodModal
          foodId={editFoodId}
          onClose={() => setEditFoodId(null)}
          onSaved={() => {
            // Servings just changed — invalidate the cache so the inline edit
            // dropdown picks up new UOMs the next time the user expands a row.
            __foodServingsCache.delete(editFoodId);
            setEditFoodId(null);
            refresh({ silent: true });
            onChange?.();
          }}
        />
      )}

      {/* MOVE ENTRY MODAL — relocate a logged food to a different date/time */}
      {moveEntry && (
        <MoveEntryModal
          entry={moveEntry}
          onClose={() => setMoveEntry(null)}
          onSave={async (target) => {
            await handleMoveEntry(moveEntry.id, target);
            setMoveEntry(null);
          }}
        />
      )}

      {/* COPY ENTRY MODAL — duplicate a logged food to a different date/time */}
      {copyEntry && (
        <MoveEntryModal
          entry={copyEntry}
          variant="copy"
          onClose={() => setCopyEntry(null)}
          onSave={async (target) => {
            await handleCopyEntry(copyEntry, target);
            setCopyEntry(null);
          }}
        />
      )}

      {/* BULK RELOCATE MODAL — move or copy every selected entry to a chosen day/time */}
      {bulkMode && (
        <BulkRelocateModal
          variant={bulkMode}
          count={selectedIds.size}
          seedDate={date}
          onClose={() => setBulkMode(null)}
          onSave={async (target) => {
            await handleBulkRelocate(bulkMode, target);
            setBulkMode(null);
          }}
        />
      )}

      {/* REPLACE ENTRY MODAL — the full food logger, in single-swap replace mode.
          Picking a food (search/scan/recipe/quick) PUTs it onto the existing entry. */}
      {replaceEntry && (
        <AddEntryModal
          date={date}
          mode="create"
          defaultTime={replaceEntry.entry_time.slice(0, 5)}
          initialPicker="search"
          editingEntry={null}
          replaceEntry={replaceEntry}
          onClose={() => setReplaceEntry(null)}
          onSaved={(created) => {
            const replacedId = replaceEntry?.id;
            setReplaceEntry(null);
            // OPTIMISTIC — swap the replaced row for the new one(s) in one paint;
            // the silent refresh reconciles (was a blocking, spinner-flashing refetch).
            insertEntriesNow(created, replacedId);
            refresh({ silent: true });
            onChange?.();
          }}
        />
      )}

    </>
  );
}

/* ============================================================
   MOVE ENTRY MODAL
   ============================================================ */

// Relocate a single logged entry to a chosen date + time. Backend (PUT
// /api/entries/[id]) already accepts entry_date + entry_time; this is just the
// picker UI. Seeded from the entry's current values so the user nudges rather
// than re-enters.
function MoveEntryModal({
  entry,
  variant = "move",
  onClose,
  onSave,
}: {
  entry: FoodEntry;
  // "move" relocates the entry in place; "copy" leaves the original and logs a new
  // entry at the target (so copying to the same date/time is a valid duplicate).
  variant?: "move" | "copy";
  onClose: () => void;
  onSave: (target: { entry_date: string; entry_time: string }) => Promise<void> | void;
}) {
  // INPUT
  const [draftDate, setDraftDate] = useState<string>(entry.entry_date);
  const [draftTime, setDraftTime] = useState<string>(entry.entry_time.slice(0, 5));

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const isCopy = variant === "copy";
  const unchanged = draftDate === entry.entry_date && draftTime === entry.entry_time.slice(0, 5);
  // Move to the same slot is a no-op (disabled); copy to the same slot is a deliberate duplicate.
  const disableSave = isSaving || (!isCopy && unchanged);

  async function handleSubmit() {
    if (!draftDate || !draftTime) {
      toast.error("Pick a date and time");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ entry_date: draftDate, entry_time: draftTime });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <span>
          {isCopy ? "Copy entry" : "Move entry"}
          <span className="text-subtle" style={{ display: "block", fontWeight: 400, fontSize: "0.8125rem" }}>
            {entry.display_name}
          </span>
        </span>
      }
      footer={
        /* ACTIONS */
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>

          {/* CANCEL */}
          <Button className="btn-off" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>

          {/* SAVE */}
          <Button className="btn-primary" onClick={handleSubmit} disabled={disableSave}>
            {isCopy ? <Copy className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}{" "}
            {isCopy ? "Copy" : "Move"}
          </Button>
        </div>
      }
    >
      {/* PICKERS */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

        {/* DATE FIELD */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span className="text-subtle" style={{ fontSize: "0.8125rem" }}>Date</span>
          <input
            type="date"
            className="input-field"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            aria-label="New date"
          />
        </label>

        {/* TIME FIELD */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span className="text-subtle" style={{ fontSize: "0.8125rem" }}>Time</span>
          <input
            type="time"
            className="input-field"
            value={draftTime}
            onChange={(e) => setDraftTime(e.target.value)}
            aria-label="New time"
          />
        </label>
      </div>
    </Modal>
  );
}

/* ============================================================
   BULK RELOCATE MODAL
   ============================================================ */

// Move or copy every selected entry to a chosen day (and, optionally, a single
// shared time). "Keep original times" is on by default so the common case —
// shifting a mis-dated meal to another day — preserves each entry's own time of
// day; turning it off stamps one uniform time across the whole selection.
function BulkRelocateModal({
  variant,
  count,
  seedDate,
  onClose,
  onSave,
}: {
  variant: "move" | "copy";
  count: number;
  seedDate: string;
  onClose: () => void;
  onSave: (target: { entry_date: string; entry_time: string | null }) => Promise<void> | void;
}) {
  // INPUT
  const [draftDate, setDraftDate] = useState<string>(seedDate);
  const [keepTimes, setKeepTimes] = useState<boolean>(true);
  const [draftTime, setDraftTime] = useState<string>(nowHHMM());

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const isCopy = variant === "copy";
  const noun = count === 1 ? "entry" : "entries";

  async function handleSubmit() {
    if (!draftDate) {
      toast.error("Pick a date");
      return;
    }
    if (!keepTimes && !draftTime) {
      toast.error("Pick a time");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ entry_date: draftDate, entry_time: keepTimes ? null : draftTime });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <span>
          {isCopy ? "Copy" : "Move"} {count} {noun}
        </span>
      }
      footer={
        /* ACTIONS */
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>

          {/* CANCEL */}
          <Button className="btn-off" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>

          {/* SAVE */}
          <Button className="btn-primary" onClick={handleSubmit} disabled={isSaving}>
            {isCopy ? <Copy className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}{" "}
            {isCopy ? "Copy" : "Move"}
          </Button>
        </div>
      }
    >
      {/* PICKERS */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

        {/* DATE FIELD */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span className="text-subtle" style={{ fontSize: "0.8125rem" }}>Date</span>
          <input
            type="date"
            className="input-field"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            aria-label="Target date"
          />
        </label>

        {/* KEEP-TIMES TOGGLE — when on, each entry keeps its own time of day */}
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={keepTimes}
            onChange={(e) => setKeepTimes(e.target.checked)}
            style={{ accentColor: "var(--color-primary)", width: "1rem", height: "1rem" }}
          />
          <span style={{ fontSize: "0.875rem" }}>Keep each entry&apos;s original time</span>
        </label>

        {/* TIME FIELD — only when stamping one shared time across the selection */}
        {!keepTimes && (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span className="text-subtle" style={{ fontSize: "0.8125rem" }}>Time</span>
            <input
              type="time"
              className="input-field"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              aria-label="Shared time"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ============================================================
   HOUR GROUP
   ============================================================ */

// Cache of food.servings lookups, shared across all HourGroup instances on the page.
const __foodServingsCache = new Map<string, FoodServing[]>();
const __foodServingsInFlight = new Map<string, Promise<void>>();

function prefetchFoodServings(foodId: string): Promise<void> {
  if (__foodServingsCache.has(foodId)) return Promise.resolve();
  const existing = __foodServingsInFlight.get(foodId);
  if (existing) return existing;
  const p = fetch(`/modules/forage/api/foods/${foodId}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: Food | null) => {
      const list = data && Array.isArray(data.servings) ? data.servings : [];
      __foodServingsCache.set(foodId, list);
    })
    .catch(() => {
      __foodServingsCache.set(foodId, []);
    })
    .finally(() => {
      __foodServingsInFlight.delete(foodId);
    });
  __foodServingsInFlight.set(foodId, p);
  return p;
}

function HourGroup({
  hour,
  entries,
  first,
  selectedIds,
  onToggleSelect,
  onToggleHourSelect,
  onSaveEntry,
  onDelete,
  onEditFood,
  onEditRecipe,
  onViewFood,
  onExplode,
  onMove,
  onCopy,
  onReplace,
}: {
  hour: number;
  entries: FoodEntry[];
  first: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleHourSelect: (ids: string[]) => void;
  onSaveEntry: (id: string, patch: { quantity: number; serving_id?: string | null }) => Promise<void> | void;
  onDelete: (id: string) => void;
  onEditFood: (foodId: string) => void;
  // Navigate to the recipe editor (in edit mode) for a recipe-backed entry.
  onEditRecipe: (foodId: string) => void;
  // Navigate to the food's library detail page (real, non-quick-add entries only).
  onViewFood: (foodId: string) => void;
  // Break a recipe entry into its component ingredient entries (recipe entries only).
  onExplode: (entry: FoodEntry) => void;
  // Open the move-to-date/time modal for this entry.
  onMove: (entry: FoodEntry) => void;
  // Open the copy-to-date/time modal for this entry (logs a duplicate at the target).
  onCopy: (entry: FoodEntry) => void;
  // Open the replace-food modal to swap this entry's backing food (food-backed entries only).
  onReplace: (entry: FoodEntry) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Direction the action menu opens. Flipped to "up" when the trigger sits too
  // close to the bottom of the viewport for the menu to fit below it, so it never
  // spills past the screen edge (it used to always open downward and get clipped).
  const [menuDirection, setMenuDirection] = useState<"down" | "up">("down");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState<string>("");
  const [draftServingId, setDraftServingId] = useState<string | null>(null);
  // True once the user has typed into the amount input; when set, switching
  // the unit dropdown will NOT proportionally convert (their hand-entered
  // value sticks). Reset on every UOM change so subsequent UOM changes
  // (with no further typing) convert again.
  const [draftQuantityDirty, setDraftQuantityDirty] = useState(false);
  const [availableServings, setAvailableServings] = useState<FoodServing[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // The chip currently in edit mode — used to scroll its inputs above the keyboard.
  const editChipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  // Keep the open editor above the soft keyboard. The page shell can't shrink on
  // Firefox Android (it stays pinned to 100lvh — see lib/useAppHeight), so the
  // keyboard overlays the bottom of the content. When it opens (visualViewport.height
  // shrinks on both engines) we center the editing chip in the scroll surface, which
  // sits above the keyboard on both engines (keyboard ≈ the bottom third). Retried a
  // few times because the soft keyboard animates in slowly on some devices.
  useEffect(() => {
    if (!expandedId || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const centerEditor = () => {
      const el = editChipRef.current;
      if (!el) return;
      // Only correct while the keyboard is actually open.
      if (window.innerHeight - vv.height <= 100) return;
      // Skip the scroll entirely when the chip is already fully above the keyboard —
      // re-centering an in-view editor is just a distracting jump.
      const visibleBottom = vv.offsetTop + vv.height;
      if (el.getBoundingClientRect().bottom <= visibleBottom - 16) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    vv.addEventListener("resize", centerEditor);
    // Backstops for when the keyboard is already open or animates in late.
    const timers = [250, 550, 900].map((d) => window.setTimeout(centerEditor, d));
    return () => {
      vv.removeEventListener("resize", centerEditor);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [expandedId]);

  // Map an entry's stored serving_id to a row in the food's current servings.
  // Falls back to matching by serving_unit (entries from before a food edit
  // can hold orphaned UUIDs) and finally to the first available serving.
  function resolveServingId(e: FoodEntry, list: FoodServing[]): string | null {
    if (e.serving_id && list.some((s) => s.id === e.serving_id)) return e.serving_id;
    if (e.serving_unit) {
      const m = list.find((s) => s.unit === e.serving_unit);
      if (m) return m.id;
    }
    return list[0]?.id ?? null;
  }

  function toggleExpand(e: FoodEntry) {
    if (expandedId === e.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(e.id);
    setDraftQuantity(String(e.quantity));
    setDraftQuantityDirty(false);
    if (!e.food_id) {
      setDraftServingId(e.serving_id ?? null);
      setAvailableServings([]);
      return;
    }
    const cached = __foodServingsCache.get(e.food_id);
    if (cached) {
      setAvailableServings(cached);
      setDraftServingId(resolveServingId(e, cached));
      return;
    }
    setAvailableServings([]);
    setDraftServingId(e.serving_id ?? null);
    fetch(`/modules/forage/api/foods/${e.food_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Food | null) => {
        if (!data) return;
        const list = Array.isArray(data.servings) ? data.servings : [];
        __foodServingsCache.set(e.food_id!, list);
        // Only apply if user hasn't moved on to another entry
        setExpandedId((cur) => {
          if (cur === e.id) {
            setAvailableServings(list);
            setDraftServingId(resolveServingId(e, list));
          }
          return cur;
        });
      })
      .catch(() => {});
  }

  // Serving-preserving conversion: keep the # of servings constant when switching
  // units — UNLESS the user has manually edited the amount since the last UOM
  // change. In that case, respect their hand-entered number and just swap the
  // unit. After any UOM change, reset the dirty flag so the next unit swap
  // converts cleanly again (assuming they don't retype the amount).
  function changeDraftServing(nextServingId: string | null) {
    if (draftQuantityDirty) {
      setDraftServingId(nextServingId);
      setDraftQuantityDirty(false);
      return;
    }
    const prevServ = availableServings.find((s) => s.id === draftServingId) || null;
    const nextServ = availableServings.find((s) => s.id === nextServingId) || null;
    if (!prevServ || !nextServ) {
      setDraftServingId(nextServingId);
      return;
    }
    const qNum = Number(draftQuantity);
    const prevUPS = Number(prevServ.units_per_serving);
    const nextUPS = Number(nextServ.units_per_serving);
    if (!Number.isFinite(qNum) || qNum <= 0 || prevUPS <= 0 || nextUPS <= 0) {
      setDraftServingId(nextServingId);
      return;
    }
    const converted = (qNum / prevUPS) * nextUPS;
    setDraftServingId(nextServingId);
    setDraftQuantity(String(Math.round(converted * 1000) / 1000));
  }

  // Live macros for the entry currently being edited — scales the saved macros by
  // the ratio of the draft amount (in canonical servings) to the saved amount, so
  // the chip's kcal/P/F/C update as the user types or swaps units (logger-style).
  // Falls back to the stored macros when the amount/servings can't be resolved.
  function editLiveMacros(e: FoodEntry) {
    const qDraft = Number(draftQuantity);
    let factor = 1;
    if (e.quantity > 0 && Number.isFinite(qDraft) && qDraft > 0) {
      if (e.food_id && availableServings.length > 0) {
        const origServ =
          availableServings.find((s) => s.id === e.serving_id) ??
          availableServings.find((s) => s.unit === e.serving_unit) ??
          null;
        const draftServ = availableServings.find((s) => s.id === draftServingId) ?? null;
        const upsOrig = origServ ? Number(origServ.units_per_serving) : 0;
        const upsDraft = draftServ ? Number(draftServ.units_per_serving) : 0;
        factor = upsOrig > 0 && upsDraft > 0 ? (upsOrig / e.quantity) * (qDraft / upsDraft) : qDraft / e.quantity;
      } else {
        factor = qDraft / e.quantity;
      }
    }
    return {
      kcal: e.kcal * factor,
      protein_g: e.protein_g * factor,
      fat_g: e.fat_g * factor,
      carbs_g: e.carbs_g * factor,
    };
  }

  // Macros as plain colored numbers (kcal+flame, P, F, C) — the same terse style the
  // food logger uses, replacing the pill chips. Shared by the normal chip meta (inline
  // row) and the editor's 2x2 grid; all four always show, like the logger.
  function macroNumbers(kcal: number, p: number, f: number, c: number) {
    return (
      <>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.125rem" }}>
          {Math.round(kcal)}
          <Flame size={11} style={{ color: "var(--fg-cal)" }} />
        </span>
        <span style={{ color: "var(--fg-protein)" }}>{Math.round(p)}P</span>
        <span style={{ color: "var(--fg-fat)" }}>{Math.round(f)}F</span>
        <span style={{ color: "var(--fg-carb)" }}>{Math.round(c)}C</span>
      </>
    );
  }

  async function handleSave(e: FoodEntry) {
    const raw = draftQuantity.trim();
    const qNum = Number(raw);
    // Explicitly typing 0 (e.g. "0", "0.0") removes the entry — a natural
    // "set the amount to none" → delete gesture. Guard on a non-empty raw
    // string so a cleared field (Number("") === 0) does NOT delete; it still
    // falls through to the "must be > 0" error below.
    if (raw !== "" && Number.isFinite(qNum) && qNum === 0) {
      onDelete(e.id);
      setExpandedId(null);
      return;
    }
    if (!Number.isFinite(qNum) || qNum <= 0) {
      toast.error("Quantity must be > 0");
      return;
    }
    setIsSaving(true);
    try {
      const patch: { quantity: number; serving_id?: string | null } = { quantity: qNum };
      if (e.food_id && draftServingId !== (e.serving_id ?? null)) {
        patch.serving_id = draftServingId;
      }
      await onSaveEntry(e.id, patch);
      setExpandedId(null);
    } finally {
      setIsSaving(false);
    }
  }
  const sums = entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.protein_g, f: a.f + e.fat_g, c: a.c + e.carbs_g }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
  const isEmpty = entries.length === 0;
  const hourEntryIds = entries.map((e) => e.id);
  const allHourSelected = !isEmpty && hourEntryIds.every((id) => selectedIds.has(id));
  return (
    /* HOUR GROUP */
    <div data-empty={isEmpty ? "true" : "false"} className="timeline-bucket">
      <div
        className="timeline-bucket-head"
        onClick={!isEmpty ? () => onToggleHourSelect(hourEntryIds) : undefined}
        role={!isEmpty ? "button" : undefined}
        aria-pressed={!isEmpty ? allHourSelected : undefined}
        style={{
          ...(first ? { paddingTop: "0.5rem" } : null),
          cursor: !isEmpty ? "pointer" : "default",
          userSelect: "none",
        }}
        title={!isEmpty ? (allHourSelected ? "Deselect all in this hour" : "Select all in this hour") : undefined}
      >
        <span style={{ fontWeight: allHourSelected ? 600 : undefined }}>{hourLabel(hour)}</span>
        <span className="timeline-bucket-rule" />
        {!isEmpty && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <Flame size={10} /> {Math.round(sums.kcal)}
            </span>
            <span style={{ color: "var(--fg-protein)" }}>{Math.round(sums.p)}P</span>
            <span style={{ color: "var(--fg-fat)" }}>{Math.round(sums.f)}F</span>
            <span style={{ color: "var(--fg-carb)" }}>{Math.round(sums.c)}C</span>
          </span>
        )}
      </div>

      {/* ENTRY CHIPS */}
      <div className="timeline-list">
        {entries.map((e) => (
          <Fragment key={e.id}>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: "0.5rem" }}>
              {/* SELECTION CHECKBOX */}
              <label
                onClick={(ev) => ev.stopPropagation()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  paddingLeft: "0.25rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => onToggleSelect(e.id)}
                  aria-label={`Select ${e.display_name}`}
                />
              </label>
            {expandedId === e.id ? (
              /* INLINE EDITOR — top row = name/brand; bottom row = macros (2x2 grid of
                 plain numbers, left) + amount/unit + cancel/save controls (right, save
                 on the far right). No expandable panel underneath. */
              <div ref={editChipRef} className="timeline-chip timeline-chip-editing" style={{ flex: 1, minWidth: 0 }} role="group">

                {/* MAIN — name/brand over macros. Mobile: the first two stacked rows;
                    desktop (≥640px): the left column (two rows). */}
                <div className="timeline-edit-main">

                  {/* NAME + BRAND */}
                  <div className="timeline-edit-head">
                    <div className="timeline-chip-title">{e.display_name}</div>
                    {e.brand && <div className="timeline-chip-brand">{e.brand}</div>}
                  </div>

                  {/* MACROS — inline row of live plain numbers */}
                  {(() => {
                    const m = editLiveMacros(e);
                    return (
                      <div className="timeline-edit-macros">
                        {macroNumbers(m.kcal, m.protein_g, m.fat_g, m.carbs_g)}
                      </div>
                    );
                  })()}
                </div>

                {/* EDITOR — amount + unit + cancel + save (save on the right). Mobile:
                    bottom row; desktop: right column. */}
                <div className="timeline-edit-controls">

                    {/* AMOUNT INPUT */}
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      className="input-field fg-inline-amt"
                      value={draftQuantity}
                      onChange={(ev) => {
                        setDraftQuantity(ev.target.value);
                        setDraftQuantityDirty(true);
                      }}
                      onFocus={selectOnFocus}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          ev.preventDefault();
                          handleSave(e);
                        } else if (ev.key === "Escape") {
                          setExpandedId(null);
                        }
                      }}
                      aria-label="Amount"
                      autoFocus
                    />

                    {/* UNIT SELECT (real foods) / STATIC UNIT (quick-add) */}
                    {e.food_id ? (
                      <select
                        className="input-field fg-inline-unit"
                        value={draftServingId ?? ""}
                        onChange={(ev) => changeDraftServing(ev.target.value || null)}
                        aria-label="Unit"
                        disabled={availableServings.length === 0}
                      >
                        {availableServings.length > 0 ? (
                          availableServings.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.unit}
                            </option>
                          ))
                        ) : (
                          <option value={e.serving_id ?? ""}>{e.serving_unit ?? "g"}</option>
                        )}
                      </select>
                    ) : (
                      <span className="text-muted fg-inline-unit" style={{ display: "inline-flex", alignItems: "center", fontSize: "0.76rem" }}>
                        {e.serving_unit ?? "g"}
                      </span>
                    )}

                    {/* CANCEL */}
                    <Button
                      className="btn-link fg-row-icon"
                      onClick={() => setExpandedId(null)}
                      disabled={isSaving}
                      aria-label="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </Button>

                    {/* SAVE — on the right */}
                    <Button
                      className="btn-link fg-row-icon"
                      onClick={() => handleSave(e)}
                      disabled={isSaving}
                      aria-label="Save amount"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
              </div>
            ) : (
              <button
                className="timeline-chip"
                onClick={() => toggleExpand(e)}
                style={{ flex: 1, minWidth: 0, paddingRight: "2.75rem" }}
                aria-expanded={false}
              >
                <div className="timeline-chip-title">{e.display_name}</div>
                {e.brand && <div className="timeline-chip-brand">{e.brand}</div>}
                <div className="timeline-chip-meta">
                  <span className="timeline-chip-qty">
                    {e.quantity} {e.serving_unit ?? "g"}
                  </span>
                  {macroNumbers(e.kcal, e.protein_g, e.fat_g, e.carbs_g)}
                </div>
              </button>
            )}
            </div>

            {/* THREE-DOT MENU TRIGGER — hidden while the inline editor is open */}
            {expandedId !== e.id && (
              <button
                type="button"
                aria-label="Entry actions"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (menuFor === e.id) {
                    setMenuFor(null);
                    return;
                  }
                  // FLIP DECISION — estimate the menu height from its visible items
                  // (View food + Edit food/Edit recipe + Replace food when food-backed,
                  // Explode for recipes, Move + Delete always) and open upward when there
                  // isn't room below the trigger. View+Edit count the same whether the edit
                  // target is the food or the recipe, so the estimate is unchanged.
                  const triggerRect = ev.currentTarget.getBoundingClientRect();
                  const itemCount = (e.food_id ? 3 : 0) + (e.food_source === "recipe" ? 1 : 0) + 2;
                  const estimatedMenuHeight = itemCount * 38 + 16;
                  // The menu is clipped by the nearest scrolling ancestor — the page
                  // shell's `.page-scroll`, whose bottom edge sits ABOVE any sticky
                  // bottom/search bar (those are flex siblings rendered below it). Use
                  // that edge, not the visual viewport (which extends behind the bars),
                  // so the flip actually accounts for the bottom bars instead of letting
                  // the menu open down into the region hidden behind them.
                  let boundaryBottom = window.visualViewport?.height ?? window.innerHeight;
                  let ancestor: HTMLElement | null = ev.currentTarget.parentElement;
                  while (ancestor) {
                    const overflowY = getComputedStyle(ancestor).overflowY;
                    if (overflowY === "auto" || overflowY === "scroll") {
                      boundaryBottom = Math.min(boundaryBottom, ancestor.getBoundingClientRect().bottom);
                      break;
                    }
                    ancestor = ancestor.parentElement;
                  }
                  const spaceBelow = boundaryBottom - triggerRect.bottom;
                  setMenuDirection(spaceBelow < estimatedMenuHeight + 12 ? "up" : "down");
                  setMenuFor(e.id);
                }}
                style={{
                  position: "absolute",
                  top: "50%",
                  right: "0.25rem",
                  transform: "translateY(-50%)",
                  width: "2.25rem",
                  height: "2.25rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  color: "var(--color-gray)",
                }}
              >
                <MoreVertical size={18} />
              </button>
            )}

            {menuFor === e.id && (
              <div
                onClick={(ev) => ev.stopPropagation()}
                style={{
                  position: "absolute",
                  // Anchor below the trigger by default, above it when flipped so the
                  // menu stays on-screen near the bottom of the timeline.
                  ...(menuDirection === "up" ? { bottom: "2.25rem" } : { top: "2.25rem" }),
                  right: "0.5rem",
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "0.5rem",
                  boxShadow: "0 6px 24px color-mix(in srgb, var(--solid-background) 60%, transparent)",
                  zIndex: 20,
                  minWidth: "9rem",
                  padding: "0.25rem",
                }}
              >
                {e.food_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onViewFood(e.food_id!);
                    }}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.875rem",
                      textAlign: "left",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                    }}
                  >
                    <Info size={14} /> View food
                  </button>
                )}
                {/* EDIT — recipes jump to the recipe editor (FoodModal can't edit
                    ingredients); other food-backed entries open the food editor. */}
                {e.food_id && e.food_source === "recipe" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onEditRecipe(e.food_id!);
                    }}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.875rem",
                      textAlign: "left",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                    }}
                  >
                    <BookOpen size={14} /> Edit recipe
                  </button>
                )}
                {e.food_id && e.food_source !== "recipe" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onEditFood(e.food_id!);
                    }}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.875rem",
                      textAlign: "left",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                    }}
                  >
                    <Pencil size={14} /> Edit food
                  </button>
                )}
                {e.food_source === "recipe" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onExplode(e);
                    }}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.875rem",
                      textAlign: "left",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                    }}
                  >
                    <Split size={14} /> Explode
                  </button>
                )}
                {/* REPLACE FOOD — swap the backing food, keeping this timeline slot */}
                {e.food_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      onReplace(e);
                    }}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.875rem",
                      textAlign: "left",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                    }}
                  >
                    <Replace size={14} /> Replace food
                  </button>
                )}
                {/* MOVE TO DATE/TIME — relocate this entry on the timeline */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    onMove(e);
                  }}
                  style={{
                    width: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-primary)",
                    fontSize: "0.875rem",
                    textAlign: "left",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                  }}
                >
                  <CalendarClock size={14} /> Move to…
                </button>
                {/* COPY TO DATE/TIME — log a duplicate of this entry at a chosen day/time */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    onCopy(e);
                  }}
                  style={{
                    width: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-primary)",
                    fontSize: "0.875rem",
                    textAlign: "left",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                  }}
                >
                  <Copy size={14} /> Copy to…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    onDelete(e.id);
                  }}
                  style={{
                    width: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    background: "transparent",
                    border: "none",
                    color: "var(--alert-red-text)",
                    fontSize: "0.875rem",
                    textAlign: "left",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}

          </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ENTRY ACTION SHEET
   ============================================================ */

function EntryActionSheet({
  entry,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  entry: FoodEntry;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <span>
          {entry.display_name}
          <span className="text-subtle" style={{ display: "block", fontWeight: 400, fontSize: "0.8125rem" }}>
            {formatTime(entry.entry_time)} · {Math.round(entry.kcal)} kcal
          </span>
        </span>
      }
    >
      {/* ACTIONS */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Button className="btn-blue" onClick={onEdit}>
          <Pencil className="w-4 h-4" /> Edit
        </Button>
        <Button className="btn-off" onClick={onDuplicate}>
          <Copy className="w-4 h-4" /> Duplicate to now
        </Button>
        <Button className="btn-red" onClick={onDelete}>
          <Trash2 className="w-4 h-4" /> Remove
        </Button>
      </div>
    </Modal>
  );
}

/* ============================================================
   NUTRITION MODE TOGGLE — pill-style segmented control used inside
   the Plate overlay's Nutrition section. Delegates to the app-wide
   SegmentedToggle: a grey rounded track with a single filled indicator
   that slides to the active option. The bespoke inline-styled version
   this replaced set border-radius on raw <button>s, which the global
   `button { border-radius: 0 !important }` sharp-corner reset overrode —
   so the active pill rendered as a square black box poking out of the
   rounded track. SegmentedToggle's pills carry matching !important
   weight, so the fill stays clipped to the rounded pill.
   ============================================================ */

function NutritionModeToggle({
  value,
  onChange,
}: {
  value: "plate" | "day";
  onChange: (m: "plate" | "day") => void;
}) {
  return (
    /* NUTRITION SOURCE TOGGLE — Plate (staged items) vs Day (whole day) */
    <SegmentedToggle
      options={[
        { value: "plate", label: "Plate" },
        { value: "day", label: "Day" },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/* ============================================================
   FOOD DETAILS SUB-VIEW — opened by tapping a Plate row. Matches
   MacroFactor's per-food detail layout: back chevron + centered
   name, 4 macro tiles with distribution chips, Remove/Favorite/
   To Custom actions, Impact-on-Targets rings, and a qty/unit
   editor at the bottom (number input + unit pills).
   ============================================================ */

function ProgressRing({ percent, color, value, label }: { percent: number; color: string; value: string; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, percent / 100));
  const offset = c * (1 - pct);
  return (
    /* RING TILE */
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--card-border)" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-primary)">
          {value}
        </text>
      </svg>
      <div style={{ fontSize: "0.75rem", color: "var(--color-secondary)" }}>{label}</div>
    </div>
  );
}

/* ============================================================
   RECIPE INGREDIENTS — read-only ingredient list for a recipe-source
   food, shown inside the logger details sheet (and the library detail
   sheet) so logging a recipe surfaces what's actually in it. Mirrors the
   recipe editor's view-row, but inert: tapping doesn't navigate away (the
   logger draft would be lost), so rows are plain, non-interactive cards.
   Amounts/macros are the recipe's own composition at its full yield.
   ============================================================ */
function RecipeIngredientsSection({ foodId, loggedServings = 0 }: { foodId: string; loggedServings?: number }) {
  // DATA — the recipe (serving_count + hydrated ingredient rows), fetched
  // lazily on open. null while loading; an empty list renders nothing.
  const [recipe, setRecipe] = useState<{ serving_count: number; ingredients: RecipeIngredient[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/modules/forage/api/recipes/${foodId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setRecipe(data && Array.isArray(data.ingredients) ? data : null);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setRecipe(null); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [foodId]);

  // Don't render the section header until we know there's something to show.
  if (!loaded) {
    return (
      /* INGREDIENTS LOADING */
      <div className="loading-container"><div className="loading-spinner" /></div>
    );
  }
  if (!recipe || recipe.ingredients.length === 0) return null;

  // Ingredient quantities + macros are stored per BATCH (all yield servings). Scale
  // them to the portion actually being logged so the numbers match what's on the
  // plate: scale = logged servings ÷ batch yield (e.g. 1 of a 4-serving recipe → ×¼).
  // When there's no valid logged quantity (0/unset), fall back to the full batch.
  const yieldServings = Number(recipe.serving_count) || 1;
  const scale = loggedServings > 0 ? loggedServings / yieldServings : 1;
  const showingPortion = loggedServings > 0 && loggedServings !== yieldServings;

  return (
    /* INGREDIENTS SECTION */
    <div>

      {/* HEADING — title + portion caption (logged portion, or batch yield when unscaled) */}
      <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
        Ingredients
        <span style={{ color: "var(--color-secondary)", fontWeight: 500, marginLeft: "0.5rem" }}>
          {showingPortion
            ? `For ${fmtAmount(loggedServings)} of ${fmtAmount(yieldServings)} serving${yieldServings === 1 ? "" : "s"}`
            : `Makes ${fmtAmount(yieldServings)} serving${yieldServings === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* ROWS — inert read-only ingredient cards (no navigation from the sheet) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {recipe.ingredients.map((row) => {
          const RowIcon = resolveFoodIcon(row.food_icon ?? null);
          // Placeholder rows (unresolved imports) have no resolved food: show
          // the free-text name + quantity text, no derived macros.
          const isPlaceholder = !row.ingredient_food_id;
          return (

            /* INGREDIENT ROW (read-only) */
            <div key={row.id} className="sub-card fg-ing fg-ing-row fg-ing-row-static">

              {/* ICON */}
              <RowIcon className="fg-ing-icon" />

              {/* BODY — name/brand stacked above the derived macros */}
              <div className="fg-ing-titles">

                {/* FOOD NAME */}
                <div className="fg-ing-name">{row.food_name ?? row.placeholder_name}</div>

                {/* BRAND */}
                {row.food_brand && (
                  <div className="fg-ing-brand">{row.food_brand}</div>
                )}

                {/* MACRO TIER — derived kcal + coloured P/F/C (resolved rows only),
                    scaled to the logged portion */}
                {!isPlaceholder && (
                  <div className="fg-ing-macros">

                    {/* CALORIES */}
                    <span>{Math.round((row.kcal ?? 0) * scale)} kcal</span>

                    {/* PROTEIN */}
                    <span className="fg-ing-p">{Math.round((row.protein_g ?? 0) * scale)}P</span>

                    {/* FAT */}
                    <span className="fg-ing-f">{Math.round((row.fat_g ?? 0) * scale)}F</span>

                    {/* CARBS */}
                    <span className="fg-ing-c">{Math.round((row.carbs_g ?? 0) * scale)}C</span>
                  </div>
                )}
              </div>

              {/* TRAILING — amount/unit summary (recipe-defined quantity) */}
              <div className="fg-ing-trail">

                {/* QTY / UNIT — scaled to the logged portion (placeholder rows keep
                    their free-text amount, which can't be scaled) */}
                <span className="fg-ing-qty-view">
                  {isPlaceholder
                    ? row.placeholder_quantity_text
                    : `${Math.round((row.quantity ?? 0) * scale * 1000) / 1000} ${row.serving_unit ?? ""}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoodDetails({
  food,
  quantity,
  servingId,
  onBack,
  hideHeader = false,
  dailyKcalTarget,
  dailyProteinTarget,
  dailyFatTarget,
  dailyCarbsTarget,
  nutrientCatalog,
  foodNutrients,
}: {
  food: Food;
  quantity: string;
  servingId: string | null;
  onBack: () => void;
  // When the parent already shows the food name (e.g. a sheet title), skip the
  // internal back-chevron header to avoid duplication.
  hideHeader?: boolean;
  dailyKcalTarget: number | null;
  dailyProteinTarget: number | null;
  dailyFatTarget: number | null;
  dailyCarbsTarget: number | null;
  nutrientCatalog: Nutrient[];
  foodNutrients: FoodNutrient[];
}) {
  const serving = food.servings.find((s) => s.id === servingId);
  const ups = serving ? Number(serving.units_per_serving) : 0;
  const qty = Number(quantity);
  const servingsEaten = ups > 0 && Number.isFinite(qty) && qty > 0 ? qty / ups : 0;

  const kcal = (Number(food.kcal_per_serving) || 0) * servingsEaten;
  const p = (Number(food.protein_g_per_serving) || 0) * servingsEaten;
  const f = (Number(food.fat_g_per_serving) || 0) * servingsEaten;
  const carbs = (Number(food.carbs_g_per_serving) || 0) * servingsEaten;

  // Macro distribution chips: % of macro-derived calories from each macronutrient.
  const pKcal = p * 4;
  const fKcal = f * 9;
  const cKcal = carbs * 4;
  const totalMacroKcal = pKcal + fKcal + cKcal;
  const pPct = totalMacroKcal > 0 ? Math.round((pKcal / totalMacroKcal) * 100) : 0;
  const fPct = totalMacroKcal > 0 ? Math.round((fKcal / totalMacroKcal) * 100) : 0;
  const cPct = totalMacroKcal > 0 ? Math.round((cKcal / totalMacroKcal) * 100) : 0;

  // Gram-equivalent for the "<unit> • <grams>" suffix when a g-serving exists.
  const gramServing = food.servings.find((s) => s.unit === "g");
  const totalGrams = gramServing && servingsEaten > 0 ? servingsEaten * Number(gramServing.units_per_serving) : null;

  // Impact on Targets rings: each macro's contribution to daily target.
  const rings = [
    { label: "Calories", value: Math.round(kcal), target: dailyKcalTarget, color: "var(--fg-cal)" },
    { label: "Protein", value: Math.round(p), target: dailyProteinTarget, color: "var(--fg-protein)" },
    { label: "Fat", value: Math.round(f), target: dailyFatTarget, color: "var(--fg-fat)" },
    { label: "Carbs", value: Math.round(carbs), target: dailyCarbsTarget, color: "var(--fg-carb)" },
  ];

  // DATA — resolved per-nutrient target bands (program override or FDA default,
  // straight from the API — no client-side default fallback). Module-cached. The
  // whole breakdown is held until `bandsLoaded` so no default band is painted.
  const { bands, loaded: bandsLoaded } = useNutrientTargets();
  const bandByCode = useMemo(() => new Map(bands.map((b) => [b.code, b])), [bands]);

  return (
    /* FOOD DETAILS CONTAINER */
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* HEADER ROW — back + centered name (suppressed when the parent owns the title) */}
      {!hideHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>

          {/* BACK */}
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to plate"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-primary)", padding: "0.25rem" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* NAME */}
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div className="text-card-title" style={{ fontSize: "1rem" }}>
              {food.name}
              {food.brand && (
                <span style={{ color: "var(--color-gray)", fontWeight: 500 }}> By {food.brand}</span>
              )}
            </div>
          </div>

          {/* SPACER for symmetry with the back button */}
          <div style={{ width: "1.75rem" }} />
        </div>
      )}

      {/* MACRO TILES — kcal, protein, fat, carbs with distribution % chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
        {[
          { label: "Calories", value: Math.round(kcal).toString(), pct: null as number | null, color: "var(--fg-cal)" },
          { label: "Protein", value: (Math.round(p * 10) / 10).toFixed(1), pct: pPct, color: "var(--fg-protein)" },
          { label: "Fat", value: (Math.round(f * 10) / 10).toFixed(1), pct: fPct, color: "var(--fg-fat)" },
          { label: "Carbs", value: (Math.round(carbs * 10) / 10).toFixed(1), pct: cPct, color: "var(--fg-carb)" },
        ].map((tile) => (

          /* MACRO TILE */
          <div key={tile.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>

            {/* DISTRIBUTION CHIP — color-coded, hidden for the Calories tile */}
            {tile.pct != null && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.125rem 0.5rem",
                  borderRadius: "999px",
                  background: `color-mix(in srgb, ${tile.color} 30%, transparent)`,
                  color: tile.color,
                }}
              >
                {tile.pct}%
              </span>
            )}

            {/* VALUE */}
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)" }}>
              {tile.value}
            </div>

            {/* LABEL */}
            <div style={{ fontSize: "0.75rem", color: "var(--color-secondary)" }}>{tile.label}</div>
          </div>
        ))}
      </div>

      {/* INGREDIENTS — recipe-source foods surface their component ingredient
          list here so logging a recipe shows the full details, not just macros.
          Pass the logged serving count so ingredients scale to the set portion. */}
      {food.source === "recipe" && <RecipeIngredientsSection foodId={food.id} loggedServings={servingsEaten} />}

      {/* IMPACT ON TARGETS */}
      <div>
        <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
          Impact on Targets
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
          {rings.map((r) => {
            const pct = r.target && r.target > 0 ? (r.value / r.target) * 100 : 0;
            return (
              <ProgressRing
                key={r.label}
                percent={pct}
                color={r.color}
                value={`${Math.round(pct)}%`}
                label={r.label}
              />
            );
          })}
        </div>
      </div>

      {/* NUTRIENT BREAKDOWN — full per-nutrient list grouped by category.
          Each row shows scaled amount + band (floor/target/ceiling) + %.
          Mirrors MF's Carb / Fat Breakdown stack. */}
      {(!bandsLoaded || nutrientCatalog.length === 0) ? (
        /* BREAKDOWN LOADING — wait for resolved targets so no FDA-default band
           is painted before the program bands land. */
        <div className="loading-container"><div className="loading-spinner" /></div>
      ) : (() => {
        // Build category buckets in display order. Hide buckets with no rows.
        const amountById = new Map<string, number>();
        for (const fn of foodNutrients) {
          amountById.set(fn.nutrient_id, (Number(fn.amount) || 0) * servingsEaten);
        }
        return NUTRIENT_BUCKETS.map((b) => {
          // Show every nutrient in the bucket — including no-DV supplements
          // (caffeine, water) at 0 — so nothing is left out of the breakdown.
          const rows = nutrientCatalog
            .filter((n) => b.match(n))
            .sort(byNutrientOrder);
          if (rows.length === 0) return null;
          return (
            /* BREAKDOWN SECTION */
            <div key={b.heading}>

              {/* HEADING */}
              <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
                {b.heading}
              </div>

              {/* ROWS */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {rows.map((n) => {
                  const amt = amountById.get(n.id) ?? 0;
                  // Plot the scaled serving amount against the resolved band
                  // (program override or FDA default — straight from the API, no
                  // client-side fallback), matching the Nutrition page.
                  const resolved = bandByCode.get(n.code);
                  const meterBand: NutrientBand = {
                    value: amt,
                    floor: resolved ? resolved.floor : null,
                    target: resolved ? resolved.target : null,
                    ceiling: resolved ? resolved.ceiling : null,
                  };
                  const accent = sectionColor(b.heading);
                  const d = bandDisplay(meterBand, n.unit);
                  return (

                    /* NUTRIENT ROW */
                    <div
                      key={n.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        padding: "0.625rem 0.75rem",
                        border: "1px solid var(--card-border)",
                        borderRadius: "0.5rem",
                        background: "var(--card-bg)",
                      }}
                    >

                      {/* TOP LINE — name (+ program glyph) · value · % */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>

                        {/* NAME + PROGRAM-TARGET GLYPH */}
                        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "0.375rem", fontWeight: 600, color: "var(--color-primary)" }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</span>
                          {isProgramTarget(resolved) && <ProgramTargetMark />}
                        </div>

                        {/* VALUE */}
                        <div style={{ color: "var(--color-secondary)", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                          <b style={{ color: "var(--color-primary)" }}>{fmtNutrient(amt)}</b>{d.targetText}
                        </div>

                        {/* PERCENT or NO TARGET */}
                        <div style={{ minWidth: "3.5rem", textAlign: "right", fontSize: "0.875rem", color: d.pctColor }}>
                          {d.pctText}
                        </div>
                      </div>

                      {/* METER — floor/target/ceiling bar, shared with the Nutrition page */}
                      {d.showBar && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <NutrientMeter band={meterBand} fillColor={accent} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        });
      })()}

      {/* USED IN RECIPES — parent recipes that include this food */}
      <div style={{ marginTop: "1.25rem" }}>
        <RecipeUsageList foodId={food.id} />
      </div>

    </div>
  );
}

/* ============================================================
   FOOD DETAILS SHEET — opened by tapping a picker row. Shows the rich
   FoodDetails (macro tiles, impact rings, nutrient breakdown) over a
   draft amount/unit, with explicit Add / Cancel. It does NOT commit to
   the plate until Add, so browsing details never silently stages a food
   — the picker list stays a low-stakes surface.
   ============================================================ */

function FoodDetailsSheet({
  rawFood,
  existing,
  dailyKcalTarget,
  dailyProteinTarget,
  dailyFatTarget,
  dailyCarbsTarget,
  onCommit,
  onClose,
}: {
  rawFood: Food;
  // The current plate entry for this food (when re-opening an already-staged item),
  // else null. Seeds the draft + flips the action label to "Update".
  existing: { servingId: string | null; quantity: string } | null;
  dailyKcalTarget: number | null;
  dailyProteinTarget: number | null;
  dailyFatTarget: number | null;
  dailyCarbsTarget: number | null;
  onCommit: (servingId: string | null, quantity: string) => void;
  onClose: () => void;
}) {
  // Same virtual-unit augmentation the collection uses, so the unit picker matches.
  const food = useMemo(() => withVirtualUnits(rawFood), [rawFood]);
  const nutrientCatalog = useNutrients();

  // DATA — listFoods omits per-food nutrient rows to stay lean; fetch lazily on open.
  const [foodNutrients, setFoodNutrients] = useState<FoodNutrient[] | null>(
    Array.isArray(rawFood.nutrients) ? rawFood.nutrients : null
  );
  useEffect(() => {
    if (foodNutrients != null) return;
    let cancelled = false;
    fetch(`/modules/forage/api/foods/${rawFood.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setFoodNutrients(Array.isArray(data?.nutrients) ? (data.nutrients as FoodNutrient[]) : []); })
      .catch(() => { if (!cancelled) setFoodNutrients([]); });
    return () => { cancelled = true; };
  }, [rawFood.id, foodNutrients]);

  // INPUT — draft amount + unit. Seed priority: the existing plate entry (editing) →
  // the food's last-logged serving/amount ("Latest" rows) → the reference amount on a
  // preferred non-gram unit.
  const preferred = useMemo(
    () => food.servings.find((s) => s.unit !== "g") ?? food.servings[0] ?? null,
    [food]
  );
  const lastServing =
    rawFood.last_serving_id != null
      ? food.servings.find((s) => s.id === rawFood.last_serving_id) ?? null
      : null;
  const [servingId, setServingId] = useState<string | null>(
    existing?.servingId ?? lastServing?.id ?? preferred?.id ?? null
  );
  const [quantity, setQuantity] = useState<string>(
    existing?.quantity ??
      (lastServing && rawFood.last_quantity != null
        ? fmtAmount(rawFood.last_quantity)
        : fmtAmount(Number(preferred?.units_per_serving) || 1))
  );

  const serving = food.servings.find((s) => s.id === servingId) ?? null;
  const qNum = Number(quantity);

  // Serving-preserving unit switch (mirrors updateCollectionUnit): keep the same
  // real amount eaten when swapping units.
  function changeUnit(nextServingId: string | null) {
    const nextServ = food.servings.find((s) => s.id === nextServingId) ?? null;
    const prevUPS = serving ? Number(serving.units_per_serving) : 0;
    const nextUPS = nextServ ? Number(nextServ.units_per_serving) : 0;
    if (nextServ && serving && Number.isFinite(qNum) && qNum > 0 && prevUPS > 0 && nextUPS > 0) {
      setQuantity(fmtAmount((qNum / prevUPS) * nextUPS));
    }
    setServingId(nextServingId);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      sheet
      title={
        <span>
          {food.name}
          {food.brand && <span style={{ color: "var(--color-gray)", fontWeight: 500 }}> By {food.brand}</span>}
        </span>
      }
      footer={
        /* SHEET FOOTER — Cancel + Add/Update (amount editor lives in the body) */
        <>
          <Button className="btn-link" onClick={onClose}>Cancel</Button>
          <Button className="btn-green" onClick={() => onCommit(servingId, quantity)} style={{ flex: 1 }}>
            {existing ? "Update plate" : "Add to plate"}
          </Button>
        </>
      }
    >
      {/* AMOUNT EDITOR — typeable amount + unit (no stepper buttons) */}
      <div className="list-row-qty fg-sheet-qty">

        {/* AMOUNT INPUT — auto-focus on open so the review sheet lands with the weight
            ready to type (the field users almost always set when logging a food),
            matching the timeline inline editor. onFocus=selectOnFocus selects the
            seeded amount so the first keystroke replaces it. */}
        <input
          autoFocus
          type="number"
          step="0.1"
          inputMode="decimal"
          className="input-field"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onFocus={selectOnFocus}
          aria-label="Amount"
          style={{ flex: "0 0 5rem", textAlign: "center" }}
        />

        {/* UNIT SELECT */}
        <select
          className="input-field"
          value={servingId ?? ""}
          onChange={(e) => changeUnit(e.target.value || null)}
          aria-label="Unit"
          style={{ flex: 1, minWidth: "3.5rem" }}
        >
          {food.servings.length === 0 && <option value="" disabled>—</option>}
          {food.servings.map((s) => (
            <option key={s.id} value={s.id}>{s.unit}</option>
          ))}
        </select>
      </div>

      {/* RICH DETAILS — macro tiles, impact rings, full nutrient breakdown */}
      <FoodDetails
        food={food}
        quantity={quantity}
        servingId={servingId}
        onBack={onClose}
        hideHeader
        dailyKcalTarget={dailyKcalTarget}
        dailyProteinTarget={dailyProteinTarget}
        dailyFatTarget={dailyFatTarget}
        dailyCarbsTarget={dailyCarbsTarget}
        nutrientCatalog={nutrientCatalog}
        foodNutrients={foodNutrients ?? []}
      />
    </Modal>
  );
}

/* ============================================================
   PLATE OVERLAY — MF-style expanded view of the staged collection.
   Lists each staged item with inline qty/unit + remove, then a
   Nutrition section with a Plate / Day toggle and 4 macro cards.
   ============================================================ */

type PlateEntry = { food: Food; servingId: string | null; quantity: string; dirty?: boolean };

function PlateOverlay({
  collection,
  nutritionMode,
  onNutritionModeChange,
  dailyKcalTotal,
  dailyKcalTarget,
  dailyProteinTotal,
  dailyProteinTarget,
  dailyFatTotal,
  dailyFatTarget,
  dailyCarbsTotal,
  dailyCarbsTarget,
  entries,
  onEditEntry,
  onViewRecord,
  onEditRecord,
  onUpdateQuantity,
  onUpdateUnit,
  onCommitQuantity,
}: {
  collection: PlateEntry[];
  nutritionMode: "plate" | "day";
  onNutritionModeChange: (m: "plate" | "day") => void;
  dailyKcalTotal: number | null;
  dailyKcalTarget: number | null;
  dailyProteinTotal: number | null;
  dailyProteinTarget: number | null;
  dailyFatTotal: number | null;
  dailyFatTarget: number | null;
  dailyCarbsTotal: number | null;
  dailyCarbsTarget: number | null;
  entries: FoodEntry[];
  // Tapping a plate row's body opens the shared FoodDetailsSheet (the same sheet
  // the picker slides open) seeded with the staged entry, so reviewing a plate
  // item is identical to reviewing a food. AddEntryModal wires this to setPreviewFood.
  onEditEntry: (food: Food) => void;
  // ⋮ MENU — same View/Edit record actions the picker rows carry, so a staged
  // item's menu behaves identically to its picker row.
  onViewRecord?: (food: Food) => void;
  onEditRecord?: (food: Food) => void;
  // Amount editing — same handlers the picker rows use, so the chip's inline
  // editor writes straight back to the staged collection.
  onUpdateQuantity: (foodId: string, q: string) => void;
  onUpdateUnit: (foodId: string, servingId: string | null) => void;
  onCommitQuantity: (foodId: string, q: string) => void;
}) {
  // Catalog of all known nutrients (vitamins/minerals/other) — used to label
  // and order the micros list under the macro grid.
  const nutrientCatalog = useNutrients();
  const nutrientById = useMemo(
    () => new Map(nutrientCatalog.map((n) => [n.id, n])),
    [nutrientCatalog]
  );
  const nutrientByCode = useMemo(
    () => new Map(nutrientCatalog.map((n) => [n.code, n])),
    [nutrientCatalog]
  );

  // Plate-mode aggregation needs each food's nutrient breakdown, but listFoods
  // omits it to keep the picker lean. Lazy-fetch full food rows for any plate
  // item missing nutrients and cache by food_id.
  const [foodNutrientsById, setFoodNutrientsById] = useState<Map<string, FoodNutrient[]>>(new Map());
  useEffect(() => {
    const need = collection
      .map((c) => c.food)
      .filter((f) => !Array.isArray(f.nutrients) && !foodNutrientsById.has(f.id));
    if (need.length === 0) return;
    let cancelled = false;
    Promise.all(
      need.map((f) =>
        fetch(`/modules/forage/api/foods/${f.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => ({ id: f.id, nutrients: Array.isArray(data?.nutrients) ? data.nutrients as FoodNutrient[] : [] }))
          .catch(() => ({ id: f.id, nutrients: [] as FoodNutrient[] }))
      )
    ).then((results) => {
      if (cancelled) return;
      setFoodNutrientsById((prev) => {
        const next = new Map(prev);
        for (const r of results) next.set(r.id, r.nutrients);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [collection, foodNutrientsById]);

  // Sum micros into a nutrient_id → amount map. Day mode pulls from each
  // entry's per-row `micros` (already scaled server-side, keyed by code).
  // Plate mode multiplies each food's per-serving nutrient amount by the
  // staged number of servings.
  const microTotals = useMemo(() => {
    const out = new Map<string, number>();
    if (nutritionMode === "day") {
      for (const e of entries) {
        if (!e.micros) continue;
        for (const [code, amt] of Object.entries(e.micros)) {
          const n = nutrientByCode.get(code);
          if (!n) continue;
          out.set(n.id, (out.get(n.id) ?? 0) + Number(amt || 0));
        }
      }
    } else {
      for (const c of collection) {
        const serving = c.food.servings.find((s) => s.id === c.servingId);
        const ups = serving ? Number(serving.units_per_serving) : 0;
        const qty = Number(c.quantity);
        if (!Number.isFinite(qty) || qty <= 0 || ups <= 0) continue;
        const servings = qty / ups;
        const list = c.food.nutrients ?? foodNutrientsById.get(c.food.id) ?? [];
        for (const fn of list) {
          if (!nutrientById.has(fn.nutrient_id)) continue;
          out.set(fn.nutrient_id, (out.get(fn.nutrient_id) ?? 0) + Number(fn.amount || 0) * servings);
        }
      }
    }
    return out;
  }, [nutritionMode, entries, collection, foodNutrientsById, nutrientById, nutrientByCode]);

  const microRows = useMemo(
    () =>
      nutrientCatalog
        .filter((n) => (microTotals.get(n.id) ?? 0) > 0)
        .sort(byNutrientOrder),
    [nutrientCatalog, microTotals]
  );

  // Compute per-item macros from kcal_per_serving × (quantity / units_per_serving)
  // — i.e. how many canonical servings the user staged.
  const plateTotals = collection.reduce(
    (acc, c) => {
      const serving = c.food.servings.find((s) => s.id === c.servingId);
      const ups = serving ? Number(serving.units_per_serving) : 0;
      const qty = Number(c.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || ups <= 0) return acc;
      const servings = qty / ups;
      return {
        kcal: acc.kcal + (Number(c.food.kcal_per_serving) || 0) * servings,
        protein: acc.protein + (Number(c.food.protein_g_per_serving) || 0) * servings,
        fat: acc.fat + (Number(c.food.fat_g_per_serving) || 0) * servings,
        carbs: acc.carbs + (Number(c.food.carbs_g_per_serving) || 0) * servings,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const cards =
    nutritionMode === "day"
      ? [
          { label: "Calories", unit: "kcal", total: dailyKcalTotal, target: dailyKcalTarget, color: "var(--fg-cal)" },
          { label: "Protein", unit: "g", total: dailyProteinTotal, target: dailyProteinTarget, color: "var(--fg-protein)" },
          { label: "Fat", unit: "g", total: dailyFatTotal, target: dailyFatTarget, color: "var(--fg-fat)" },
          { label: "Carbs", unit: "g", total: dailyCarbsTotal, target: dailyCarbsTarget, color: "var(--fg-carb)" },
        ]
      : [
          { label: "Calories", unit: "kcal", total: plateTotals.kcal, target: dailyKcalTarget, color: "var(--fg-cal)" },
          { label: "Protein", unit: "g", total: plateTotals.protein, target: dailyProteinTarget, color: "var(--fg-protein)" },
          { label: "Fat", unit: "g", total: plateTotals.fat, target: dailyFatTarget, color: "var(--fg-fat)" },
          { label: "Carbs", unit: "g", total: plateTotals.carbs, target: dailyCarbsTarget, color: "var(--fg-carb)" },
        ];

  return (
    /* PLATE OVERLAY CONTAINER */
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* YOUR PLATE SECTION */}
      <div>

        {/* SECTION HEADING */}
        <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
          Your Plate
        </div>

        {/* ITEM LIST — the same FoodRecordRow the picker slides use, rendered with
            the same props, so a staged food is IDENTICAL on both: same avatar,
            title, live macros, ⋮ menu and inline amount/unit editor. The plate is
            just the picker's rows filtered to what you staged. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {collection.map((c) => (
            <FoodRecordRow
              key={c.food.id}
              food={c.food}
              entry={c}
              inCollection
              onOpenDetails={() => onEditEntry(c.food)}
              onView={onViewRecord ? () => onViewRecord(c.food) : undefined}
              onEdit={onEditRecord ? () => onEditRecord(c.food) : undefined}
              onUpdateQuantity={onUpdateQuantity}
              onUpdateUnit={onUpdateUnit}
              onCommitQuantity={onCommitQuantity}
            />
          ))}
        </div>
      </div>

      {/* NUTRITION SECTION */}
      <div>

        {/* HEADING ROW — title + Plate/Day toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <div className="section-heading" style={{ paddingLeft: 0 }}>
            Nutrition
          </div>

          {/* TOGGLE */}
          <NutritionModeToggle value={nutritionMode} onChange={onNutritionModeChange} />
        </div>

        {/* MACRO CARD GRID — 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          {cards.map((c) => {
            const total = c.total ?? 0;
            const target = c.target ?? 0;
            const pct = target > 0 ? Math.min(1, total / target) : 0;
            return (

              /* MACRO CARD */
              <div
                key={c.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                  padding: "0.75rem",
                  border: "1px solid var(--card-border)",
                  borderRadius: "0.625rem",
                  background: "var(--card-bg)",
                }}
              >

                {/* LABEL */}
                <div className="text-card-title" style={{ fontSize: "1rem" }}>{c.label}</div>

                {/* VALUE */}
                <div style={{ fontSize: "0.875rem", color: "var(--color-secondary)" }}>
                  {c.total == null ? "—" : Math.round(c.total)}
                  {c.target != null && ` / ${Math.round(c.target)}`}
                  {" "}{c.unit}
                </div>

                {/* PROGRESS BAR — only shown when a target exists */}
                {c.target != null && c.target > 0 && (
                  <div
                    style={{
                      height: "0.375rem",
                      borderRadius: "999px",
                      background: "var(--hover-bg)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct * 100}%`,
                        height: "100%",
                        background: c.color,
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* MICRONUTRIENT LIST — every catalog nutrient with a non-zero total
            for the current mode (plate or day). Renders nothing when there's
            no data so the layout stays compact for newly-added foods. */}
        {microRows.length > 0 && (
          <div
            style={{
              marginTop: "0.75rem",
              border: "1px solid var(--card-border)",
              borderRadius: "0.625rem",
              background: "var(--card-bg)",
              overflow: "hidden",
            }}
          >
            {microRows.map((n, i) => {
              const amt = microTotals.get(n.id) ?? 0;
              const display = amt < 10 ? amt.toFixed(1) : String(Math.round(amt));
              const pct =
                typeof n.daily_value === "number" && n.daily_value > 0
                  ? Math.round((amt / n.daily_value) * 100)
                  : null;
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.375rem 0.75rem",
                    borderTop: i === 0 ? "none" : "1px solid var(--card-border)",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span style={{ color: "var(--color-primary)" }}>{n.name}</span>
                  <span style={{ color: "var(--color-secondary)", whiteSpace: "nowrap" }}>
                    {display} {n.unit}
                    {pct != null && (
                      <span style={{ marginLeft: "0.5rem", color: "var(--color-gray)" }}>
                        {pct}% DV
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ADD / EDIT ENTRY MODAL
   ============================================================ */

export function AddEntryModal({
  date,
  mode,
  defaultTime,
  initialPicker,
  initialFood,
  editingEntry,
  replaceEntry,
  onClose,
  onSaved,
  hideTabs,
  ingredientMode,
  onPickFood,
}: {
  date: string;
  mode: "create" | "edit";
  defaultTime: string;
  initialPicker?: "scan" | "search" | "recipes" | "quick" | "add";
  // Pre-stage this food onto the plate when the modal opens (its own last-logged
  // serving/amount seeds the row), so a tapped pairing suggestion only needs an
  // amount confirmation before logging.
  initialFood?: Food;
  editingEntry: FoodEntry | null;
  // REPLACE MODE — when set, the logger swaps the backing food of THIS existing
  // entry instead of logging new ones: the plate is held to a single item and
  // committing PUTs the chosen food/quick-add onto replaceEntry.id (keeping its
  // date/time). Everything else (search/scan/recipes/quick/create, details sheet)
  // is the identical food-logger experience.
  replaceEntry?: FoodEntry | null;
  onClose: () => void;
  // Receives the freshly-logged, fully-hydrated entries so the host can paint
  // them optimistically; may be empty if the route fell back to a bare id.
  onSaved: (created?: FoodEntry[]) => void;
  hideTabs?: ("scan" | "search" | "recipes" | "quick" | "add")[];
  ingredientMode?: boolean;
  onPickFood?: (food: Food, selection?: { servingId: string | null; quantity: number | null }) => void;
}) {
  const router = useRouter();

  // DATA
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [foodsLoading, setFoodsLoading] = useState<boolean>(false);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  // Foods the user most often logs around the current hour-of-day — surfaced in a
  // "Frequent now" section above Latest so the usual meal-time items are one tap away.
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  // FREQUENTLY-PAIRED SUGGESTIONS — anchor food id -> the foods usually logged on the
  // same day as it. Filled the moment a food lands on the plate and rendered as real
  // records injected directly beneath that food's row (not a separate widget): add
  // cereal, and milk slides in under it ready to add at its usual amount.
  const [pairedByAnchor, setPairedByAnchor] = useState<Record<string, Food[]>>({});
  // Recipes for the Recipes tab — ordered server-side per `recipeSort`
  // (last used / created / A–Z); see the recipes load effect below.
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState<boolean>(false);
  // Daily kcal eaten + active target for this date — shown in the header pill.
  const [dailyEntries, setDailyEntries] = useState<FoodEntry[]>([]);
  const [dailyKcalTotal, setDailyKcalTotal] = useState<number | null>(null);
  const [dailyKcalTarget, setDailyKcalTarget] = useState<number | null>(null);
  // Day-mode totals + targets for the Nutrition section. Pulled alongside kcal
  // from /api/entries and /api/targets so the Day toggle has data ready.
  const [dailyProteinTotal, setDailyProteinTotal] = useState<number | null>(null);
  const [dailyFatTotal, setDailyFatTotal] = useState<number | null>(null);
  const [dailyCarbsTotal, setDailyCarbsTotal] = useState<number | null>(null);
  const [dailyProteinTarget, setDailyProteinTarget] = useState<number | null>(null);
  const [dailyFatTarget, setDailyFatTarget] = useState<number | null>(null);
  const [dailyCarbsTarget, setDailyCarbsTarget] = useState<number | null>(null);

  // INPUT
  const [picker, setPicker] = useState<"scan" | "search" | "recipes" | "quick" | "add">(
    initialPicker ?? (editingEntry && !editingEntry.food_id ? "quick" : "search")
  );
  const [search, setSearch] = useState("");
  // What actually gets searched. The raw `search` stays untrimmed so the box still
  // accepts a space mid-word ("colby jack"), but every query built from it uses the
  // trimmed text: a mobile keyboard appends a trailing space after a word, and that
  // space used to make the query miss (e.g. "shake " returned nothing for "Shake").
  const searchQuery = search.trim();
  // Sort order for the Recipes tab list — applied client-side (see sortedRecipes).
  // Cycled via the panel toggle and remembered across sessions in localStorage so
  // it opens on the user's last-chosen order; defaults to 'last_used'.
  const [recipeSort, setRecipeSort] = useState<"last_used" | "created" | "name">(() => {
    if (typeof window === "undefined") return "last_used";
    const saved = window.localStorage.getItem("forage.recipeSort");
    return saved === "created" || saved === "name" || saved === "last_used" ? saved : "last_used";
  });
  // Staged items to log together. Each entry has its own unit + amount.
  // `dirty` tracks whether the user has typed into the amount since the last
  // UOM change — when set, switching unit preserves the typed value instead
  // of converting it. Reset on every UOM swap.
  const [collection, setCollection] = useState<{ food: Food; servingId: string | null; quantity: string; dirty?: boolean }[]>([]);
  const [quantity, setQuantity] = useState<string>(String(editingEntry?.quantity ?? "1"));
  const [entryTime, setEntryTime] = useState<string>(editingEntry?.entry_time?.slice(0, 5) || defaultTime);
  const [qName, setQName] = useState(editingEntry?.quick_add_name ?? "");
  const [qKcal, setQKcal] = useState(
    editingEntry && !editingEntry.food_id ? String(Math.round((editingEntry.kcal / editingEntry.quantity) * 10) / 10) : ""
  );
  const [qP, setQP] = useState(
    editingEntry && !editingEntry.food_id ? String(Math.round((editingEntry.protein_g / editingEntry.quantity) * 10) / 10) : ""
  );
  const [qC, setQC] = useState(
    editingEntry && !editingEntry.food_id ? String(Math.round((editingEntry.carbs_g / editingEntry.quantity) * 10) / 10) : ""
  );
  const [qF, setQF] = useState(
    editingEntry && !editingEntry.food_id ? String(Math.round((editingEntry.fat_g / editingEntry.quantity) * 10) / 10) : ""
  );
  // Free-text description fed to the AI estimator. Only used in the quick-add tab.
  const [qDescription, setQDescription] = useState("");

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  // True while the /quick-add-describe call is in flight; disables the button and
  // shows a spinner. The Claude CLI typically returns in 4-10s.
  const [isDescribing, setIsDescribing] = useState(false);
  const [isCreatingGeneric, setIsCreatingGeneric] = useState(false);
  const [genericName, setGenericName] = useState("");
  // The Add tab launches the full Create-Food wizard as a fullscreen overlay.
  // null = closed; an object = open, optionally pre-filling the name (from the
  // search "Create X" CTA) or the UPC (from a barcode-scan miss). On completion
  // the new food is staged straight onto the plate (handleFoodCreated).
  const [createDraft, setCreateDraft] = useState<
    { name?: string; barcode?: string; draft?: LabelOcrDraft; sourceUrl?: string; imageUrl?: string | null } | null
  >(null);
  // OPEN FOOD FACTS FALLBACK — suggestions shown only when the library search
  // comes up empty, so "nothing found" offers a pick instead of a from-scratch
  // create. `offPickingCode` marks the row whose draft is being fetched.
  const [offSuggestions, setOffSuggestions] = useState<OffSuggestion[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offPickingCode, setOffPickingCode] = useState<string | null>(null);
  // Expanded "Your Plate" overlay (MF-style). When true, the modal body is
  // replaced by the plate list + Nutrition section; otherwise the picker
  // content (search/scan/recipes/quick) renders.
  const [isPlateExpanded, setIsPlateExpanded] = useState(false);
  // The food whose details sheet is open (row-body tap in search OR a plate row in
  // the expanded overlay). The sheet drafts amount/unit locally and only commits to
  // the plate on Add/Update — so browsing details never silently stages. Tapping a
  // plate item routes through the SAME FoodDetailsSheet the logger uses, so editing a
  // staged food is identical to logging a new one (amount editor + rich details).
  const [previewFood, setPreviewFood] = useState<Food | null>(null);
  // Plate vs Day toggle inside the Nutrition section of the expanded view.
  const [nutritionMode, setNutritionMode] = useState<"plate" | "day">("day");
  // Barcode scan tab — file input + in-flight flag + last scan result for inline status.
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  // Search field in the footer pill — focused on open so the food logger pops the
  // soft keyboard immediately when launched from the dashboard search pill.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Hidden native time picker triggered by the terse time pill in the header.
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const [lastScannedUpc, setLastScannedUpc] = useState<string | null>(null);
  const [lastScanMissed, setLastScanMissed] = useState(false);
  // Toggles the live-camera scanner overlay. Primary path; the file-upload remains
  // as a fallback for desktops without cameras or browsers that block getUserMedia.
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);

  // `seed` carries the last-logged serving + amount for "Latest" rows so a re-add
  // reuses what the user actually ate. serving_id there references a real serving
  // row (never the implicit canonical "serving"), so per-100ml foods like water
  // stay on their base unit.
  function addToCollection(
    rawFood: Food,
    seed?: { servingId: string | null; quantity: number | null }
  ) {
    if (ingredientMode && onPickFood) {
      // Carry the last-logged serving + amount through so the recipe row reflects
      // what the user actually ate (e.g. "0.47 lb"), not a hardcoded 1.
      onPickFood(rawFood, seed);
      return;
    }
    // Augment with virtual same-family units so the picker offers them; default
    // to a real (non-virtual) base unit, not a synthesized one.
    const food = withVirtualUnits(rawFood);
    setCollection((prev) => {
      if (prev.find((c) => c.food.id === food.id)) return prev;
      // Seed from the last-logged serving when given (and still valid), else fall
      // back to a real non-gram base unit.
      const seedServing =
        seed?.servingId != null ? food.servings.find((s) => s.id === seed.servingId) ?? null : null;
      const preferred =
        seedServing ?? rawFood.servings.find((s) => s.unit !== "g") ?? rawFood.servings[0] ?? null;
      // Default amount = the last-logged quantity when seeded, otherwise the
      // serving's reference amount (units_per_serving) so the staged value matches
      // the picker label — "100 ml" for water, "1 serving" for a serving-basis food
      // — instead of a unit-agnostic "1".
      const quantity =
        seedServing && seed?.quantity != null && Number.isFinite(seed.quantity) && seed.quantity > 0
          ? fmtAmount(seed.quantity)
          : fmtAmount(Number(preferred?.units_per_serving) || 1);
      return [
        ...prev,
        { food, servingId: preferred?.id ?? null, quantity },
      ];
    });
  }

  // PRE-STAGE — when the modal is opened with an initialFood, drop it onto the
  // plate once on mount, seeded from its own last-logged serving + amount so the
  // user just confirms the size and logs.
  const stagedInitialRef = useRef(false);
  useEffect(() => {
    if (!initialFood || stagedInitialRef.current) return;
    stagedInitialRef.current = true;
    addToCollection(initialFood, {
      servingId: initialFood.last_serving_id ?? null,
      quantity: initialFood.last_quantity ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Anchors already asked about, and every food id currently shown AS a suggestion.
  // Refs rather than state so the fetch effect below can read them without listing
  // them as deps — depending on the very map it writes would re-run it forever.
  const pairedAskedRef = useRef<Set<string>>(new Set());
  const suggestedIdsRef = useRef<Set<string>>(new Set());

  // PAIRING INJECTION — whenever a food lands on the plate, pull the foods usually
  // logged alongside it and hang them off that food's row. Watching `collection`
  // (rather than hooking the + button) means every staging path feeds it: the row +,
  // the details sheet, a barcode scan, the create-food wizard, a USDA lookup.
  //
  // Two deliberate limits keep it a nudge instead of a cascade: a food staged FROM a
  // suggestion never fetches its own partners (one level deep, so the list can't
  // grow without bound), and a group is dropped when its anchor leaves the plate.
  useEffect(() => {
    if (ingredientMode) return;
    const stagedIds = new Set(collection.map((c) => c.food.id));

    // Drop groups whose anchor is no longer staged; their foods return to the
    // normal Frequent/Latest/Library sections that excluded them while shown.
    setPairedByAnchor((prev) => {
      const stale = Object.keys(prev).filter((anchorId) => !stagedIds.has(anchorId));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const anchorId of stale) {
        for (const food of next[anchorId]) suggestedIdsRef.current.delete(food.id);
        pairedAskedRef.current.delete(anchorId);
        delete next[anchorId];
      }
      return next;
    });

    // Quick-add foods are ephemeral client-side objects with no library row (and so
    // no logging history) to pair against.
    const anchors = collection
      .map((c) => c.food)
      .filter(
        (food) =>
          !food.id.startsWith(QUICK_PREFIX) &&
          !pairedAskedRef.current.has(food.id) &&
          !suggestedIdsRef.current.has(food.id)
      );

    for (const anchor of anchors) {
      pairedAskedRef.current.add(anchor.id);
      fetch(`/modules/forage/api/foods/${anchor.id}/paired?limit=10`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Food[]) => {
          // Never suggest what is already staged, already suggested under another
          // anchor, or already an anchor itself; cap the group so one add can't
          // bury the search results.
          const fresh = (Array.isArray(data) ? data : [])
            .filter(
              (food) =>
                !stagedIds.has(food.id) &&
                !suggestedIdsRef.current.has(food.id) &&
                !pairedAskedRef.current.has(food.id)
            )
            .slice(0, PAIRED_SUGGESTION_LIMIT);
          if (fresh.length === 0) return;
          for (const food of fresh) suggestedIdsRef.current.add(food.id);
          setPairedByAnchor((prev) => ({ ...prev, [anchor.id]: fresh }));
        })
        .catch(() => {
          // Suggestions are a nudge — a failed fetch just means none appear.
        });
    }
  }, [collection, ingredientMode]);

  // Tap a picker row → open the details sheet WITHOUT staging. Ingredient-picker
  // mode bypasses the sheet and picks immediately.
  function openDetailsSheet(rawFood: Food) {
    if (ingredientMode && onPickFood) {
      onPickFood(rawFood);
      return;
    }
    setPreviewFood(rawFood);
  }

  // ROW ⋮ ACTIONS — jump from a logger row to the backing record's own page:
  // recipes own /ui/recipes/<id>, everything else /ui/library/<id>, and `?edit=1`
  // lands either straight in that page's edit mode. Both close the logger first
  // (same as the Recipes tab's "Manage recipes" link), so the staged plate is
  // dropped — leaving the logger to edit a record is an explicit detour.
  function recordHref(food: Food, edit: boolean): string {
    const base =
      food.source === "recipe"
        ? `/modules/forage/ui/recipes/${food.id}`
        : `/modules/forage/ui/library/${food.id}`;
    return edit ? `${base}?edit=1` : base;
  }

  function openRecordPage(food: Food, edit: boolean) {
    onClose();
    router.push(recordHref(food, edit));
  }

  // The ⋮ actions leave the logger, which in ingredient-picker mode would discard
  // the half-built recipe behind it — so the menu is omitted there entirely.
  function rowMenuProps(food: Food) {
    if (ingredientMode) return {};
    return {
      onView: () => openRecordPage(food, false),
      onEdit: () => openRecordPage(food, true),
    };
  }

  // Commit the details sheet's drafted amount/unit to the plate. Adds a new entry
  // or updates the existing one (re-opening a staged food), then closes the sheet.
  function commitFromSheet(servingId: string | null, quantity: string) {
    if (!previewFood) return;
    if (ingredientMode && onPickFood) {
      onPickFood(previewFood);
      setPreviewFood(null);
      return;
    }
    const food = withVirtualUnits(previewFood);
    setCollection((prev) => {
      if (prev.find((c) => c.food.id === food.id)) {
        return prev.map((c) => (c.food.id === food.id ? { ...c, servingId, quantity, dirty: true } : c));
      }
      return [...prev, { food, servingId, quantity }];
    });
    setPreviewFood(null);
  }

  function removeFromCollection(foodId: string) {
    setCollection((prev) => {
      const next = prev.filter((c) => c.food.id !== foodId);
      // Collapse the plate when the last item is removed.
      if (next.length === 0) {
        setIsPlateExpanded(false);
      }
      return next;
    });
  }

  // Serving-preserving unit switch. Each row is "1 serving = units_per_serving of this unit",
  // so servings_eaten = quantity / prevUPS; converted_qty = servings_eaten × nextUPS.
  // If the user dirtied the amount since the last UOM change, skip conversion and keep
  // their typed value verbatim — only swap the unit. Reset dirty after either path.
  function updateCollectionUnit(foodId: string, nextServingId: string | null) {
    setCollection((prev) =>
      prev.map((c) => {
        if (c.food.id !== foodId) return c;
        if (c.dirty) {
          return { ...c, servingId: nextServingId, dirty: false };
        }
        const prevServ = c.food.servings.find((s) => s.id === c.servingId) || null;
        const nextServ = c.food.servings.find((s) => s.id === nextServingId) || null;
        if (!nextServ) return { ...c, servingId: nextServingId, dirty: false };
        const qNum = Number(c.quantity);
        const prevUPS = prevServ ? Number(prevServ.units_per_serving) : 0;
        const nextUPS = Number(nextServ.units_per_serving);
        if (!prevServ || !Number.isFinite(qNum) || qNum <= 0 || prevUPS <= 0 || nextUPS <= 0) {
          return { ...c, servingId: nextServingId, quantity: "1", dirty: false };
        }
        const converted = (qNum / prevUPS) * nextUPS;
        return {
          ...c,
          servingId: nextServingId,
          quantity: String(Math.round(converted * 1000) / 1000),
          dirty: false,
        };
      })
    );
  }

  function updateCollectionQuantity(foodId: string, q: string) {
    setCollection((prev) => prev.map((c) => (c.food.id === foodId ? { ...c, quantity: q, dirty: true } : c)));
  }

  // Commit a staged amount on blur: if the user left it at an explicit 0 (or
  // emptied it), drop the food from the plate — entering zero deletes, mirroring
  // the diary inline editor. Fires on blur (not per-keystroke) so typing "0.5"
  // never trips it. Non-zero amounts are left untouched (updateCollectionQuantity
  // already stored them live).
  function commitCollectionQuantity(foodId: string, q: string) {
    const qNum = Number(q.trim());
    if (q.trim() === "" || (Number.isFinite(qNum) && qNum === 0)) {
      removeFromCollection(foodId);
    }
  }

  function handleFoodCreated(created: Food) {
    setAllFoods((prev) => [created, ...prev]);
    addToCollection(created);
  }

  // Open the Create-Food wizard overlay (optionally pre-filled) and mark the Add
  // tab active so it highlights underneath. Used by the Add tab, the search
  // "Create X" CTA, and the barcode-scan-miss CTA.
  function openCreateWizard(prefill?: { name?: string; barcode?: string }) {
    setCreateDraft(prefill ?? {});
    setPicker("add");
  }

  // Wizard finished — stage the new food onto the plate, close the overlay, and
  // drop back to Search so the plate is visible.
  function handleWizardCreated(created: Food) {
    handleFoodCreated(created);
    setCreateDraft(null);
    setLastScanMissed(false);
    setLastScannedUpc(null);
    setPicker("search");
  }

  // Wizard cancelled — close the overlay and return to Search.
  function handleWizardCancel() {
    setCreateDraft(null);
    setPicker("search");
  }

  // Switch the active picker tab. Clear any in-progress search when moving to a
  // different tab so a food query doesn't bleed into the recipes filter (or vice
  // versa) — the search box is shared between the Search and Recipes tabs.
  function selectPicker(next: "scan" | "search" | "recipes" | "quick") {
    if (next !== picker) setSearch("");
    setPicker(next);
  }

  useEffect(() => {
    fetch(`/modules/forage/api/foods/recent?limit=10`).then((r) => r.json()).then((d) => Array.isArray(d) && setRecentFoods(d)).catch(() => {});
    // Frequent-at-this-hour suggestions. Pass the client's local hour since entry_time
    // is stored in local wall-clock (see defaultTime); the server only uses it as a fallback.
    fetch(`/modules/forage/api/foods/frequent?hour=${new Date().getHours()}&limit=8`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setFrequentFoods(d))
      .catch(() => {});
  }, []);

  // Pull the day's eaten kcal + active target so the header pill can show
  // "<eaten> / <target>" without the parent having to drill props through.
  useEffect(() => {
    fetch(`/modules/forage/api/entries?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.entries)) return;
        setDailyEntries(d.entries as FoodEntry[]);
        type EntryMacros = { kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number };
        const totals = d.entries.reduce(
          (a: { kcal: number; protein: number; fat: number; carbs: number }, e: EntryMacros) => ({
            kcal: a.kcal + (Number(e.kcal) || 0),
            protein: a.protein + (Number(e.protein_g) || 0),
            fat: a.fat + (Number(e.fat_g) || 0),
            carbs: a.carbs + (Number(e.carbs_g) || 0),
          }),
          { kcal: 0, protein: 0, fat: 0, carbs: 0 }
        );
        setDailyKcalTotal(totals.kcal);
        setDailyProteinTotal(totals.protein);
        setDailyFatTotal(totals.fat);
        setDailyCarbsTotal(totals.carbs);
      })
      .catch(() => {});
    fetch(`/modules/forage/api/targets?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (!t) return;
        // Targets API may return the row directly or wrapped in { target: {...} }.
        const src = t?.target && typeof t.target === "object" ? t.target : t;
        const pick = (k: string) => (typeof src[k] === "number" ? src[k] : null);
        const kcal = pick("kcal");
        const p = pick("protein_g");
        const f = pick("fat_g");
        const c = pick("carbs_g");
        if (kcal != null) setDailyKcalTarget(Math.round(kcal));
        if (p != null) setDailyProteinTarget(Math.round(p));
        if (f != null) setDailyFatTarget(Math.round(f));
        if (c != null) setDailyCarbsTarget(Math.round(c));
      })
      .catch(() => {});
  }, [date]);

  // Auto-launch the live camera whenever the user lands on / switches to the
  // scan tab. The overlay can still be closed manually; reopening it just
  // requires switching away and back.
  useEffect(() => {
    if (picker === "scan") setIsLiveScannerOpen(true);
  }, [picker]);

  // Scrolling the results list drops the keyboard, so a raised keyboard doesn't
  // eat half the list while the user is scanning it. Scoped to `.modal-body` (the
  // modal's scroll surface) — the search field itself is anchored above that, and
  // the diary's inline editors scroll `.page-scroll`, so neither is affected.
  useBlurActiveInputOnScroll({ withinSelector: ".modal-body" });

  // Pop the keyboard the instant the food logger lands on the search tab (create
  // flow only — editing an entry shouldn't fling the keyboard up). The shared
  // Modal mounts its children a tick after open, so the footer input isn't in the
  // DOM on the first frame — retry across a few frames until the ref resolves.
  useEffect(() => {
    if (mode !== "create" || picker !== "search" || isPlateExpanded) return;
    let raf = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = searchInputRef.current;
      if (el) { el.focus(); return; }
      if (tries++ < 20) raf = requestAnimationFrame(tryFocus);
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [mode, picker, isPlateExpanded]);

  useEffect(() => {
    if (picker !== "search") return;
    // Race guard: the empty-search load fired on open returns the full library and
    // is slow; if the user starts typing before it resolves, the late response must
    // NOT clobber the narrower search results. Cleanup cancels the in-flight request
    // so only the latest `search` value's response is applied (mirrors the sibling
    // search effects above).
    let cancelled = false;
    setFoodsLoading(true);
    fetch(`/modules/forage/api/foods${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setAllFoods(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) toast.error("Failed to load foods"); })
      .finally(() => { if (!cancelled) setFoodsLoading(false); });
    return () => { cancelled = true; };
  }, [searchQuery, picker]);

  // Pull the full record for a tapped suggestion and open the create wizard
  // pre-filled with it. Deliberately does NOT create the food outright — an Open
  // Food Facts entry is community-entered and of uneven completeness, so it gets
  // the same review step a scanned label does.
  async function handlePickOffSuggestion(suggestion: OffSuggestion) {
    if (offPickingCode) return;
    setOffPickingCode(suggestion.code);
    try {
      const res = await fetch(
        `/modules/forage/api/foods/openfoodfacts?code=${encodeURIComponent(suggestion.code)}`
      );
      const draft = await res.json();
      if (!res.ok) {
        toast.error(draft?.error || "Couldn't read that product", { id: "off-pick" });
        return;
      }
      // Stamp the Open Food Facts record as the food's source link, so where the
      // numbers came from stays visible on the food and Resync has something to
      // re-read later.
      setCreateDraft({
        draft: draft as LabelOcrDraft,
        sourceUrl: draft?.data_source_url ?? undefined,
        imageUrl: draft?.image_url ?? null,
      });
      setPicker("add");
    } catch {
      toast.error("Couldn't read that product", { id: "off-pick" });
    } finally {
      setOffPickingCode(null);
    }
  }

  // Load the user's recipes when the Recipes tab is active. The same `search`
  // box (shown under the tabs for this tab too) narrows the list server-side.
  // The whole list comes back in one payload (TOP 200) carrying each recipe's
  // sort keys (ts_created + last_used), so `recipeSort` reorders client-side
  // without a refetch — the tab toggle stays instant.
  useEffect(() => {
    if (picker !== "recipes") return;
    // Same race guard as the foods search effect: a stale empty-search load must not
    // overwrite a newer narrowed result when the user types before the first load lands.
    let cancelled = false;
    setRecipesLoading(true);
    fetch(`/modules/forage/api/recipes${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRecipes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) toast.error("Failed to load recipes"); })
      .finally(() => { if (!cancelled) setRecipesLoading(false); });
    return () => { cancelled = true; };
  }, [searchQuery, picker]);

  // Reorder the loaded recipes client-side per the selected sort. `last_used` /
  // `ts_created` are ISO strings hydrated by the API; nulls (never logged / missing)
  // sort last. Name sort is locale-aware and case-insensitive.
  const sortedRecipes = useMemo(() => {
    const byTimeDesc = (a: string | null | undefined, b: string | null | undefined) =>
      (b ? Date.parse(b) : -Infinity) - (a ? Date.parse(a) : -Infinity);
    const list = [...recipes];
    if (recipeSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    } else if (recipeSort === "created") {
      list.sort((a, b) => byTimeDesc(a.ts_created, b.ts_created) || a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => byTimeDesc(a.last_used, b.last_used) || a.name.localeCompare(b.name));
    }
    return list;
  }, [recipes, recipeSort]);

  // Remember the user's recipe sort choice across sessions.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("forage.recipeSort", recipeSort);
  }, [recipeSort]);

  const q = searchQuery.toLowerCase();
  // Token-based filter (mirrors the server-side listFoods search): require every
  // whitespace-separated token to appear somewhere in name+brand, so "colby jack"
  // matches "Colby & monterey jack..." even when the words aren't contiguous.
  const searchTokens = q.split(/\s+/).filter(Boolean);
  const matchesSearch = (f: Food) => {
    if (!searchTokens.length) return true;
    const haystack = `${f.name} ${f.brand ?? ""}`.toLowerCase();
    return searchTokens.every((token) => haystack.includes(token));
  };
  // Foods currently injected as pairing suggestions under a staged food's row. They
  // are pulled OUT of the three sections below so a suggested food shows up exactly
  // once — under its anchor — instead of twice; dropping the group (anchor unstaged)
  // hands them straight back to their normal section.
  const pairedSuggestionIds = new Set(
    Object.values(pairedByAnchor).flatMap((foods) => foods.map((f) => f.id))
  );
  // Frequent-now sits at the top; its ids are excluded from Latest + Library below
  // so a food only ever appears in one section.
  const frequentFiltered = frequentFoods.filter((f) => matchesSearch(f) && !pairedSuggestionIds.has(f.id));
  // Heading reflects the local hour the suggestions are keyed to, e.g. "9PM favorites".
  const frequentHourLabel = (() => {
    const h = new Date().getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${h < 12 ? "AM" : "PM"} favorites`;
  })();
  const frequentIds = new Set(frequentFiltered.map((f) => f.id));
  const recentFiltered = recentFoods.filter(
    (f) => matchesSearch(f) && !frequentIds.has(f.id) && !pairedSuggestionIds.has(f.id)
  );
  const recentIds = new Set(recentFiltered.map((f) => f.id));
  // Also apply the client-side token filter here (the frequent/recent sections above
  // already do): keeps the library list honest to the current search text even if
  // `allFoods` still holds an in-flight/stale server response for a previous query.
  const librarySection = allFoods.filter(
    (f) => matchesSearch(f) && !recentIds.has(f.id) && !frequentIds.has(f.id) && !pairedSuggestionIds.has(f.id)
  );
  const collectionIds = new Set(collection.map((c) => c.food.id));
  // True when the three library sections above have nothing for this query — the
  // only condition under which the Open Food Facts lane appears.
  const hasNoLocalMatch =
    frequentFiltered.length === 0 && recentFiltered.length === 0 && librarySection.length === 0;

  // OPEN FOOD FACTS FALLBACK — only fires once the user's OWN foods have loaded
  // and come back empty for a real query, so it costs nothing on the common path
  // and can never reorder or delay the library results. Debounced because it runs
  // off every keystroke's worth of search text.
  useEffect(() => {
    if (picker !== "search" || foodsLoading || !hasNoLocalMatch || searchQuery.trim().length < 2) {
      setOffSuggestions([]);
      setOffLoading(false);
      return;
    }

    let cancelled = false;
    setOffLoading(true);
    const timer = setTimeout(() => {
      fetch(`/modules/forage/api/foods/openfoodfacts?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => r.json())
        .then((data) => { if (!cancelled) setOffSuggestions(Array.isArray(data) ? data : []); })
        // Silent on failure: this is a bonus lane, and the empty state below it
        // already tells the user nothing matched.
        .catch(() => { if (!cancelled) setOffSuggestions([]); })
        .finally(() => { if (!cancelled) setOffLoading(false); });
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, picker, foodsLoading, hasNoLocalMatch]);

  // One picker row, plus any pairing suggestions that food unlocked when it was
  // staged. The suggestions are the SAME FoodRecordRow as everything else — they
  // animate into the list directly beneath their anchor rather than rendering a
  // separate widget, so adding cereal simply grows a milk row under it that adds
  // at its usual amount in one more tap.
  function renderPickerRow(
    food: Food,
    keyPrefix: string,
    seed?: { servingId: string | null; quantity: number | null }
  ) {
    const suggestions = pairedByAnchor[food.id] ?? [];
    return (
      <Fragment key={`${keyPrefix}-${food.id}`}>

        {/* FOOD ROW */}
        <FoodRecordRow
          food={food}
          entry={collection.find((c) => c.food.id === food.id) ?? null}
          inCollection={collectionIds.has(food.id)}
          onAdd={() => addToCollection(food, seed)}
          onOpenDetails={() => openDetailsSheet(food)}
          {...rowMenuProps(food)}
          onUpdateQuantity={updateCollectionQuantity}
          onUpdateUnit={updateCollectionUnit}
          onCommitQuantity={commitCollectionQuantity}
        />

        {/* PAIRED RECORDS — injected under the anchor once it is on the plate */}
        {suggestions.length > 0 && (
          <div className="fg-paired-group">

            {/* CAPTION — why these rows appeared */}
            <div className="fg-paired-caption">
              Frequently paired with <span className="fg-paired-anchor">{food.name}</span>
            </div>

            {suggestions.map((partner, index) => (

              /* PAIRED RECORD — staggered so the group reads as one arrival */
              <div
                key={partner.id}
                className="fg-paired-record"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <FoodRecordRow
                  food={partner}
                  entry={collection.find((c) => c.food.id === partner.id) ?? null}
                  inCollection={collectionIds.has(partner.id)}
                  // Re-add a partner at the amount it was last logged at, exactly like
                  // a Latest row — the pairing endpoint ships that seed with the food.
                  onAdd={() =>
                    addToCollection(partner, {
                      servingId: partner.last_serving_id ?? null,
                      quantity: partner.last_quantity ?? null,
                    })
                  }
                  onOpenDetails={() => openDetailsSheet(partner)}
                  {...rowMenuProps(partner)}
                  onUpdateQuantity={updateCollectionQuantity}
                  onUpdateUnit={updateCollectionUnit}
                  onCommitQuantity={commitCollectionQuantity}
                />
              </div>
            ))}
          </div>
        )}
      </Fragment>
    );
  }

  // Shared post-decode flow: look up the UPC in the library; on a hit add the food
  // to the collection and snap back to Search; on a miss surface the inline "create
  // with this UPC" card. Called by both the live-camera scanner (instant) and the
  // file-upload fallback (server-side zbarimg).
  async function resolveScannedUpc(upc: string, toastId: string, symbology: string | null) {
    setLastScannedUpc(upc);
    const lookup = await fetch(`/modules/forage/api/foods?barcode=${encodeURIComponent(upc)}`);
    const matches: Food[] = lookup.ok ? await lookup.json() : [];
    if (Array.isArray(matches) && matches.length > 0) {
      addToCollection(matches[0]);
      setPicker("search");
      setLastScanMissed(false);
      toast.success(`Matched ${matches[0].name}`, { id: toastId });
    } else {
      setLastScanMissed(true);
      toast(`No library match for ${upc}${symbology ? ` (${symbology})` : ""}`, { id: toastId, icon: "🔍" });
    }
  }

  // Live-camera path. Called by LiveBarcodeScanner the moment ZXing decodes a
  // frame — no server hop on the decode itself, just the library lookup.
  async function handleLiveBarcode(upc: string, symbology: string) {
    setIsLiveScannerOpen(false);
    const toastId = toast.loading("Looking up…");
    try {
      await resolveScannedUpc(upc, toastId, symbology);
    } catch {
      toast.error("Failed to look up barcode", { id: toastId });
    }
  }

  // File-upload fallback. Posts the image to /api/barcode-scan (server-side zbarimg)
  // and feeds the decoded UPC into the same library-lookup flow above.
  async function handleScanBarcodeFile(file: File) {
    setIsScanningBarcode(true);
    setLastScanMissed(false);
    const toastId = toast.loading("Reading barcode…");
    try {
      const form = new FormData();
      form.append("image", file);
      const scanRes = await fetch(`/modules/forage/api/barcode-scan`, { method: "POST", body: form });
      if (!scanRes.ok) {
        const err = await scanRes.json().catch(() => ({}));
        toast.error(err?.error || "Failed to read barcode", { id: toastId });
        return;
      }
      const draft: { barcode_upc: string | null; symbology: string | null } = await scanRes.json();
      if (!draft.barcode_upc) {
        setLastScannedUpc(null);
        setLastScanMissed(false);
        toast.error("No barcode detected — try a clearer photo", { id: toastId });
        return;
      }
      await resolveScannedUpc(draft.barcode_upc, toastId, draft.symbology);
    } catch {
      toast.error("Failed to read barcode", { id: toastId });
    } finally {
      setIsScanningBarcode(false);
      if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    }
  }

  // Stage an ephemeral quick-add food onto the plate at a given amount. Bypasses
  // addToCollection's dedup/seed logic since each quick item is unique and carries
  // its own per-unit macros + amount.
  function stageQuickFood(food: Food, quantity: string) {
    setCollection((prev) => [
      ...prev,
      { food, servingId: food.servings[0]?.id ?? null, quantity },
    ]);
  }

  // AI ESTIMATE → PLATE. Sends the free-text description to the LLM estimator and
  // stages the result straight onto the plate (totals for the described amount, so
  // quantity 1), then clears the box.
  async function handleDescribeWithAI() {
    const desc = qDescription.trim();
    if (!desc) {
      toast.error("Describe your food first");
      return;
    }
    setIsDescribing(true);
    try {
      const res = await fetch(`/modules/forage/api/quick-add-describe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "AI estimate failed");
        return;
      }
      const est: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number } = await res.json();
      const r1 = (n: number) => Math.round(n * 10) / 10;
      stageQuickFood(makeQuickFood(est.name, Math.round(est.kcal), r1(est.protein_g), r1(est.carbs_g), r1(est.fat_g)), "1");
      setQDescription("");
      toast.success(`Added "${est.name}" to plate`);
    } catch {
      toast.error("AI estimate failed");
    } finally {
      setIsDescribing(false);
    }
  }

  // USDA LOOKUP → PLATE. Resolves the name against USDA FoodData Central, persists it
  // as a reusable library food, and stages it onto the plate.
  async function handleUsdaLookup() {
    const name = genericName.trim();
    if (!name) { toast.error("Enter a food name"); return; }
    setIsCreatingGeneric(true);
    try {
      const res = await fetch(`/modules/forage/api/usda-food`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "USDA lookup failed");
        return;
      }
      const food: Food = await res.json();
      addToCollection(food);
      setGenericName("");
      toast.success(`Added "${food.name}" to plate`);
    } catch {
      toast.error("USDA lookup failed");
    } finally {
      setIsCreatingGeneric(false);
    }
  }

  // MANUAL QUICK ADD → PLATE. Stages a one-off entry from the typed macro fields at
  // the typed quantity, then clears the form.
  function handleAddQuickToPlate() {
    const name = qName.trim();
    if (!name || !qKcal) {
      toast.error("Name and calories required");
      return;
    }
    stageQuickFood(
      makeQuickFood(name, Number(qKcal), Number(qP || 0), Number(qC || 0), Number(qF || 0)),
      fmtAmount(Number(quantity) || 1)
    );
    setQName("");
    setQKcal("");
    setQP("");
    setQC("");
    setQF("");
    setQuantity("1");
    toast.success(`Added "${name}" to plate`);
  }

  // Enter in any Manual-entry field commits to the plate, matching the
  // "Add to plate" button's guard (name + calories required) so a keypress
  // can't fire while the button is disabled.
  function handleManualEnter(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter" && qName.trim() && qKcal) {
      ev.preventDefault();
      handleAddQuickToPlate();
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      // Build every entry to POST. The staged collection (real foods) and the Quick
      // tab's quick-add draft are independent surfaces — log BOTH so neither silently
      // drops the other (e.g. plate foods + an AI-estimated quick-add in one save).
      // In REPLACE MODE this is identical — the logger stages and logs exactly as
      // usual; the only difference is the original entry being replaced is deleted
      // once every staged item has been logged successfully (see the success branch).
      const requests: Promise<Response>[] = [];

      // Stamp each plate item with a monotonically-increasing log timestamp (one
      // shared base + the item's push index, in ms) so the diary's
      // `ORDER BY entry_time, ts_logged` keeps plate order on the reconciling
      // refetch. Without this the parallel POSTs tie on the DB's DEFAULT GETDATE()
      // (~3.33ms ticks) and reshuffle the just-logged rows. Push order below
      // matches the optimistic paint order (created[] follows requests[]).
      const plateLoggedBase = Date.now();
      let plateSeq = 0;

      // Quick-add draft: only when the Quick tab is active and fully filled.
      const quickReady = picker === "quick" && qName.trim() !== "" && qKcal !== "";
      if (quickReady) {
        requests.push(
          fetch(`/modules/forage/api/entries`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              entry_date: date,
              entry_time: entryTime,
              quantity: Number(quantity),
              quick_add_name: qName.trim(),
              quick_add_kcal: Number(qKcal),
              quick_add_protein_g: Number(qP || 0),
              quick_add_carbs_g: Number(qC || 0),
              quick_add_fat_g: Number(qF || 0),
              food_id: null,
              serving_id: null,
              ts_logged: new Date(plateLoggedBase + plateSeq++).toISOString(),
            }),
          })
        );
      }

      // Staged plate foods.
      for (const c of collection) {
        // Ephemeral quick-add foods (AI estimate / manual) carry their macros on the
        // synthetic food itself and have no real food_id — log them as quick-add
        // entries (food_id null), scaled by the plate amount.
        if (c.food.id.startsWith(QUICK_PREFIX)) {
          requests.push(
            fetch(`/modules/forage/api/entries`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                entry_date: date,
                entry_time: entryTime,
                quantity: Number(c.quantity),
                quick_add_name: c.food.name,
                quick_add_kcal: Number(c.food.kcal_per_serving),
                quick_add_protein_g: Number(c.food.protein_g_per_serving),
                quick_add_carbs_g: Number(c.food.carbs_g_per_serving),
                quick_add_fat_g: Number(c.food.fat_g_per_serving),
                food_id: null,
                serving_id: null,
                ts_logged: new Date(plateLoggedBase + plateSeq++).toISOString(),
              }),
            })
          );
          continue;
        }
        // Convert a virtual-unit selection (e.g. fl oz) back to the food's real base
        // unit (e.g. ml) so the stored entry references a real serving row.
        const resolved = resolveServingForSave(c.food.servings ?? [], c.servingId, Number(c.quantity));
        requests.push(
          fetch(`/modules/forage/api/entries`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              entry_date: date,
              entry_time: entryTime,
              quantity: resolved.quantity,
              food_id: c.food.id,
              serving_id: resolved.serving_id,
              quick_add_name: null,
              ts_logged: new Date(plateLoggedBase + plateSeq++).toISOString(),
            }),
          })
        );
      }

      if (requests.length === 0) {
        // Nothing to log: guide the user to whichever surface they were using.
        toast.error(picker === "quick" ? "Name and kcal required" : "Add a food to the collection");
        return;
      }

      // OPTIMISTIC CLOSE — drop the modal the instant we commit to logging, before
      // the POSTs resolve, so the diary's macro bars / calorie ring underneath are
      // visible when the optimistic insert (onSaved below) animates them. Waiting
      // for the network kept the modal covering the very animation it triggers.
      // onSaved still fires after the POSTs to paint + reconcile the rows; its
      // parent closures captured the pre-close state (e.g. the replaced entry id),
      // so the reconcile is unaffected. A failed POST surfaces via the toast below.
      onClose();

      const results = await Promise.all(requests);
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        // Collect the hydrated entries the POSTs returned (route now responds with
        // the full row, not just an id) so the caller can paint them immediately —
        // an optimistic insert instead of waiting on the reconciling refetch.
        const created = (await Promise.all(results.map((r) => r.json().catch(() => null))))
          .filter((e): e is FoodEntry => !!e && typeof e === "object" && !!e.id);
        // REPLACE MODE — every staged item logged at the entry's slot, so the
        // original entry it's replacing can now be removed. Only delete after a
        // fully-successful log so a partial failure never drops the original.
        if (replaceEntry) {
          await fetch(`/modules/forage/api/entries/${replaceEntry.id}`, { method: "DELETE" });
          toast.success("Replaced");
        } else {
          toast.success(requests.length === 1 ? "Logged" : `Logged ${requests.length} items`);
        }
        onSaved(created);
      } else {
        toast.error(`Failed to log ${failed} of ${requests.length}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        /* HEADER PILL ROW — close · time · daily-kcal */
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>

          {/* CLOSE PILL */}
          <button
            type="button"
            className="time-pill"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            style={{ padding: "0 0.75rem" }}
          >
            <X className="w-4 h-4" />
          </button>

          {/* TIME PILL — tap opens native time picker */}
          <button
            type="button"
            className="time-pill"
            onClick={() => {
              // Prefer showPicker(), but call it EXACTLY once — its return value
              // is undefined, so `showPicker() ?? click()` would always fire BOTH
              // (double picker-open + a NotAllowedError when activation is spent).
              // Fall back to focus+click only when showPicker is missing or throws
              // (e.g. no transient user activation / older engines).
              const el = timeInputRef.current;
              if (!el) return;
              try {
                if (typeof el.showPicker === "function") {
                  el.showPicker();
                  return;
                }
              } catch {
                // fall through to the focus+click fallback below
              }
              el.focus();
              el.click();
            }}
          >
            <span>{formatTimePill(entryTime)}</span>
            <input
              ref={timeInputRef}
              type="time"
              value={entryTime}
              onChange={(e) => setEntryTime(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
            />
          </button>

          {/* DAILY KCAL PILL — eaten / target */}
          <span className="time-pill" aria-label="Calories today" style={{ cursor: "default" }}>
            <span>
              {dailyKcalTotal == null ? "—" : Math.round(dailyKcalTotal)}
              {" / "}
              {dailyKcalTarget == null ? "—" : dailyKcalTarget}
            </span>
          </span>
        </div>
      }
      modalActions={
        /* RIGHT-SIDE ACTION — single plate pill combining latest food icon,
           (+N) counter, and the expand/collapse chevron. They're one control
           (tap anywhere to toggle the Your Plate overlay), so they share a
           single .time-pill background instead of looking like two buttons. */
        (() => {
          const hasItems = collection.length > 0;
          const latest = hasItems ? collection[collection.length - 1].food : null;
          const LatestIcon = latest ? resolveFoodIcon(latest.icon) : null;
          const extras = collection.length - 1;
          return (
            <button
              type="button"
              className="time-pill"
              onClick={() => hasItems && setIsPlateExpanded((v) => !v)}
              disabled={isSaving || !hasItems}
              aria-label={
                hasItems
                  ? `${isPlateExpanded ? "Collapse" : "Expand"} plate (${collection.length} item${collection.length === 1 ? "" : "s"})`
                  : "Plate is empty"
              }
              aria-expanded={isPlateExpanded}
              title={latest?.name}
              style={{ padding: "0 0.625rem", gap: "0.375rem", opacity: hasItems ? 1 : 0.4 }}
            >

              {/* LATEST FOOD ICON */}
              {LatestIcon && <LatestIcon size={16} />}

              {/* COUNTER */}
              {extras > 0 && (
                <span style={{ fontSize: "0.8125rem", color: "var(--color-secondary)" }}>+{extras}</span>
              )}

              {/* DROPDOWN CHEVRON */}
              {isPlateExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          );
        })()
      }
      fullScreen
      disableClose={isSaving}
      subHeader={
        /* PICKER TABS — lives in the subHeader slot so the modal-body's
           flex-column overflow:auto context doesn't collapse the nav to 1px
           on mobile (which is what hid the tabs entirely). Hidden while the
           Your Plate overlay is open so the plate fully replaces the picker. */
        isPlateExpanded ? null : (
        <>
        <nav
          className="fg-logger-tabs flex sm:space-x-1 px-2 border-b border-card"
          role="tablist"
          aria-label="Add food source"
          style={{ overflowX: "auto", flexWrap: "nowrap", flexShrink: 0 }}
        >

          {/* SCAN TAB */}
          {!hideTabs?.includes("scan") && (
            <button
              type="button"
              role="tab"
              aria-selected={picker === "scan"}
              className={`tab-button ${picker === "scan" ? "tab-button-active" : ""}`}
              onClick={() => selectPicker("scan")}
            >
              <ScanBarcode className="w-4 h-4" /> Scan
            </button>
          )}

          {/* SEARCH TAB */}
          {!hideTabs?.includes("search") && (
            <button
              type="button"
              role="tab"
              aria-selected={picker === "search"}
              className={`tab-button ${picker === "search" ? "tab-button-active" : ""}`}
              onClick={() => selectPicker("search")}
            >
              <Search className="w-4 h-4" /> Search
            </button>
          )}

          {/* RECIPES TAB */}
          {!hideTabs?.includes("recipes") && (
            <button
              type="button"
              role="tab"
              aria-selected={picker === "recipes"}
              className={`tab-button ${picker === "recipes" ? "tab-button-active" : ""}`}
              onClick={() => selectPicker("recipes")}
            >
              <BookOpen className="w-4 h-4" /> Recipes
            </button>
          )}

          {/* QUICK ADD TAB */}
          {!hideTabs?.includes("quick") && (
            <button
              type="button"
              role="tab"
              aria-selected={picker === "quick"}
              className={`tab-button ${picker === "quick" ? "tab-button-active" : ""}`}
              onClick={() => selectPicker("quick")}
            >
              <Zap className="w-4 h-4" /> Quick Add
            </button>
          )}

          {/* ADD TAB — create a brand-new reusable library food */}
          {!hideTabs?.includes("add") && (
            <button
              type="button"
              role="tab"
              aria-selected={picker === "add"}
              className={`tab-button ${picker === "add" ? "tab-button-active" : ""}`}
              onClick={() => openCreateWizard()}
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </nav>

        {/* SEARCH FIELD — anchored directly beneath the tabs (not the footer) so it
            stays visible when the on-screen keyboard covers the bottom of the
            modal. Firefox Android keeps the modal full-height under the keyboard,
            so a bottom-anchored field would hide behind it. */}
        {(picker === "search" || picker === "recipes") && (
          <div style={{ padding: "0.5rem 0.5rem 0.25rem" }}>
            <div className="bottom-action-bar-pill" style={{ maxWidth: "none" }}>
              <Search className="bottom-action-bar-pill-icon w-4 h-4" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={picker === "recipes" ? "Search your recipes" : "Search for a food"}
                className="bottom-action-bar-pill-text"
                style={{ background: "transparent", border: "none", outline: "none", padding: 0 }}
              />
            </div>
          </div>
        )}
        </>
        )
      }
      footer={
        /* DEFAULT FOOTER — cancel + log button (search field now lives under the tabs).
           Plate-item editing no longer swaps this footer: a plate-row tap opens the
           shared FoodDetailsSheet (same as the logger), which carries its own
           amount/unit editor + Update button. */
        <>
          <Button className="btn-link" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button className="btn-green" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : replaceEntry ? "Replace food" : mode === "edit" ? "Save changes" : "Log Foods"}
          </Button>
        </>
      }
    >
          {isPlateExpanded ? (
            /* YOUR PLATE OVERLAY — replaces the picker body while expanded.
               Lists the staged items with inline qty/unit editors + remove,
               then a Nutrition section with a Plate/Day toggle. */
            <PlateOverlay
              collection={collection}
              nutritionMode={nutritionMode}
              onNutritionModeChange={setNutritionMode}
              dailyKcalTotal={dailyKcalTotal}
              dailyKcalTarget={dailyKcalTarget}
              dailyProteinTotal={dailyProteinTotal}
              dailyProteinTarget={dailyProteinTarget}
              dailyFatTotal={dailyFatTotal}
              dailyFatTarget={dailyFatTarget}
              dailyCarbsTotal={dailyCarbsTotal}
              dailyCarbsTarget={dailyCarbsTarget}
              entries={dailyEntries}
              onEditEntry={(food) => setPreviewFood(food)}
              onViewRecord={ingredientMode ? undefined : (food) => openRecordPage(food, false)}
              onEditRecord={ingredientMode ? undefined : (food) => openRecordPage(food, true)}
              onUpdateQuantity={updateCollectionQuantity}
              onUpdateUnit={updateCollectionUnit}
              onCommitQuantity={commitCollectionQuantity}
            />
          ) : picker === "search" ? (
            <div>
              {/* SEARCH RESULTS — search input lives under the tabs (in the subHeader) */}
              <div className="bordered-list">
                {foodsLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
                    <div className="loading-spinner" />
                  </div>
                ) : hasNoLocalMatch ? (
                  <>
                    {/* EMPTY STATE — nothing in the user's own library matched */}
                    <div className="empty-state">
                      <div className="empty-state-body">
                        {q ? `No foods match "${searchQuery}".` : "No foods yet."}
                      </div>
                      {q && (
                        <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "center" }}>
                          <Button className="btn-blue" onClick={() => openCreateWizard({ name: searchQuery })}>
                            <Plus className="w-4 h-4" /> Create "{searchQuery}"
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* OPEN FOOD FACTS LANE — a miss in the library doesn't have to
                        mean building the food by hand. Tapping a result opens the
                        create wizard pre-filled with it, so the community record is
                        still reviewed before it lands in the library. */}
                    {q && (offLoading || offSuggestions.length > 0) && (
                      <>
                        <div className="section-heading">From Open Food Facts</div>

                        {offLoading ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: "1.25rem 0" }}>
                            <div className="loading-spinner" />
                          </div>
                        ) : (
                          offSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.code}
                              type="button"
                              className="list-row"
                              onClick={() => handlePickOffSuggestion(suggestion)}
                              disabled={offPickingCode !== null}
                              style={{ width: "100%", textAlign: "left" }}
                            >
                              {/* SUGGESTION AVATAR */}
                              <span className="list-row-avatar">
                                <Globe className="w-4 h-4" />
                              </span>

                              {/* SUGGESTION IDENTITY */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="list-row-title">{suggestion.name}</div>
                                <div className="list-row-meta">
                                  {[suggestion.brand, suggestion.quantity].filter(Boolean).join(" · ") || "Open Food Facts"}
                                </div>
                              </div>

                              {/* SUGGESTION ENERGY — per 100 g/ml, the only basis the
                                  search index carries; exact per-serving figures come
                                  from the record itself once picked. */}
                              <div className="list-row-meta" style={{ flexShrink: 0 }}>
                                {offPickingCode === suggestion.code
                                  ? "Loading…"
                                  : suggestion.kcal_per_100 !== null
                                    ? `${Math.round(suggestion.kcal_per_100)} kcal/100`
                                    : ""}
                              </div>
                            </button>
                          ))
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {frequentFiltered.length > 0 && (
                      <>
                        {/* FREQUENT-NOW HEADING — foods usually logged during this clock hour */}
                        <div className="section-heading">{frequentHourLabel}</div>
                        {frequentFiltered.map((f) =>
                          // Re-add a Frequent item using its last-logged serving + amount.
                          renderPickerRow(f, "f", {
                            servingId: f.last_serving_id ?? null,
                            quantity: f.last_quantity ?? null,
                          })
                        )}
                      </>
                    )}
                    {recentFiltered.length > 0 && (
                      <>
                        <div className="section-heading">Latest</div>
                        {recentFiltered.map((f) =>
                          // Re-add a Latest item using its last-logged serving + amount.
                          renderPickerRow(f, "r", {
                            servingId: f.last_serving_id ?? null,
                            quantity: f.last_quantity ?? null,
                          })
                        )}
                      </>
                    )}
                    {librarySection.length > 0 && (
                      <>
                        <div className="section-heading">{q ? "From your library" : "Library"}</div>
                        {librarySection.map((f) => renderPickerRow(f, "l"))}
                      </>
                    )}
                  </>
                )}
              </div>

            </div>
          ) : picker === "add" ? (
            /* ADD PANEL — fallback shown behind the Create-Food wizard overlay
               (the Add tab opens the wizard immediately; this only shows if the
               wizard was dismissed without leaving the tab). The CTA reopens it.
               On completion the new food is staged straight onto the plate. */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "1.5rem 0.5rem", textAlign: "center" }}>
              {/* ADD ICON */}
              <Plus size={48} style={{ color: "var(--color-secondary)" }} />

              {/* ADD TITLE */}
              <div className="text-card-title">Create a new food</div>

              {/* ADD BLURB */}
              <div className="text-subtle" style={{ fontSize: "0.9375rem", maxWidth: "20rem" }}>
                Build a reusable food with full nutrition facts. It's saved to your library and added to the plate.
              </div>

              {/* ADD CTA */}
              <Button className="btn-blue" onClick={() => openCreateWizard()}>
                <Plus className="w-4 h-4" /> New food
              </Button>
            </div>
          ) : picker === "recipes" ? (
            /* RECIPES PANEL — the user's recipes, newest first, staged onto the
               plate exactly like a food (a recipe is a `foods` row, source='recipe').
               The dedicated Recipes page is still where you build/edit them. */
            <div>

              {/* SORT TOGGLE — cycle the server-side order: last used → created → A–Z.
                  Hidden when there are no recipes to order (and no active search). */}
              {(recipes.length > 0 || q) && (
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 0.5rem" }}>
                  <button
                    onClick={() =>
                      setRecipeSort((prev) =>
                        prev === "last_used" ? "created" : prev === "created" ? "name" : "last_used"
                      )
                    }
                    className="flex items-center gap-1 text-muted"
                    style={{ fontSize: "0.75rem", background: "none", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem" }}
                    aria-label="Change recipe sort order"
                  >
                    <ArrowDownUp className="w-3.5 h-3.5" />
                    {recipeSort === "last_used" ? "Last used" : recipeSort === "created" ? "Created" : "A–Z"}
                  </button>
                </div>
              )}

              {/* RECIPE LIST */}
              <div className="bordered-list">
                {recipesLoading ? (
                  /* LOADING SPINNER */
                  <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
                    <div className="loading-spinner" />
                  </div>
                ) : recipes.length === 0 ? (
                  /* EMPTY STATE — no recipes (or none match the search) */
                  <div className="empty-state">
                    <div className="empty-state-body">
                      {q ? `No recipes match "${searchQuery}".` : "No recipes yet. Build one on the Recipes page."}
                    </div>
                    <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "center" }}>
                      <Button
                        className="btn-blue"
                        onClick={() => {
                          onClose();
                          router.push("/modules/forage/ui/recipes");
                        }}
                      >
                        <BookOpen className="w-4 h-4" /> Open Recipes
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* RECIPE ROWS — reuse the food row; + stages 1 serving of the recipe */
                  sortedRecipes.map((recipe) => (
                    <FoodRecordRow
                      key={`recipe-${recipe.id}`}
                      food={recipe}
                      entry={collection.find((c) => c.food.id === recipe.id) ?? null}
                      inCollection={collectionIds.has(recipe.id)}
                      onAdd={() => addToCollection(recipe)}
                      onOpenDetails={() => openDetailsSheet(recipe)}
                      {...rowMenuProps(recipe)}
                      onUpdateQuantity={updateCollectionQuantity}
                      onUpdateUnit={updateCollectionUnit}
                      onCommitQuantity={commitCollectionQuantity}
                    />
                  ))
                )}
              </div>

              {/* MANAGE LINK — jump to the dedicated page to build or edit recipes */}
              {!recipesLoading && recipes.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0" }}>
                  <Button
                    className="btn-link"
                    onClick={() => {
                      onClose();
                      router.push("/modules/forage/ui/recipes");
                    }}
                  >
                    <BookOpen className="w-4 h-4" /> Manage recipes
                  </Button>
                </div>
              )}

            </div>
          ) : picker === "quick" ? (
            /* QUICK ADD — three tidy method groups (Describe / USDA / Manual) */
            <div className="fg-quick">

              {/* DESCRIBE GROUP — free-text → AI macro estimate → plate */}
              <div className="fg-quick-group">
                <div className="fg-quick-group-label">Describe with AI</div>
                <textarea
                  className="input-field"
                  value={qDescription}
                  onChange={(e) => setQDescription(e.target.value)}
                  onKeyDown={(ev) => {
                    // Enter (without Shift) submits; Shift+Enter still inserts a newline.
                    if (ev.key === "Enter" && !ev.shiftKey && !isDescribing && qDescription.trim()) {
                      ev.preventDefault();
                      handleDescribeWithAI();
                    }
                  }}
                  placeholder="e.g. two slices of pepperoni pizza and a Coke"
                  rows={2}
                  disabled={isDescribing}
                />
                <Button className="btn-blue fg-quick-cta" onClick={handleDescribeWithAI} disabled={isDescribing || !qDescription.trim()}>
                  {isDescribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isDescribing ? "Estimating…" : "AI estimate and add to plate"}
                </Button>
              </div>

              {/* USDA GROUP — authoritative FDC lookup → reusable library food → plate */}
              <div className="fg-quick-group">
                <div className="fg-quick-group-label">USDA lookup</div>
                <input
                  className="input-field"
                  value={genericName}
                  onChange={(e) => setGenericName(e.target.value)}
                  onKeyDown={(ev) => {
                    // Enter triggers the USDA lookup, matching the button's guard.
                    if (ev.key === "Enter" && !isCreatingGeneric && genericName.trim()) {
                      ev.preventDefault();
                      handleUsdaLookup();
                    }
                  }}
                  placeholder="e.g. butter, chicken breast, white rice"
                  autoCapitalize="words"
                  disabled={isCreatingGeneric}
                />
                <Button className="btn-green fg-quick-cta" onClick={handleUsdaLookup} disabled={isCreatingGeneric || !genericName.trim()}>
                  {isCreatingGeneric ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isCreatingGeneric ? "Looking up…" : "USDA lookup and add to plate"}
                </Button>
                <span className="text-subtle" style={{ fontSize: "0.8125rem" }}>Authoritative USDA FoodData Central nutrients, saved to your library</span>
              </div>

              {/* MANUAL GROUP — typed macros → one-off plate entry */}
              <div className="fg-quick-group">
                <div className="fg-quick-group-label">Manual entry</div>

                {/* NAME */}
                <div className="fg-quick-field">
                  <label className="text-label">Name</label>
                  <input className="input-field" value={qName} onChange={(e) => setQName(e.target.value)} onKeyDown={handleManualEnter} placeholder="e.g. Coffee with milk" autoCapitalize="words" />
                </div>

                {/* CALORIES + QUANTITY */}
                <div className="fg-quick-grid2">
                  <div className="fg-quick-field">
                    <label className="text-label">Calories/unit</label>
                    <input type="number" step="1" className="input-field" value={qKcal} onChange={(e) => setQKcal(e.target.value)} onFocus={selectOnFocus} onKeyDown={handleManualEnter} placeholder="0" />
                  </div>
                  <div className="fg-quick-field">
                    <label className="text-label">Quantity</label>
                    <input type="number" step="0.1" className="input-field" value={quantity} onChange={(e) => setQuantity(e.target.value)} onFocus={selectOnFocus} onKeyDown={handleManualEnter} />
                  </div>
                </div>

                {/* PROTEIN / FAT / CARBS (grams) */}
                <div className="fg-quick-grid3">
                  <div className="fg-quick-field">
                    <label className="text-label">Protein</label>
                    <input type="number" step="0.1" className="input-field" value={qP} onChange={(e) => setQP(e.target.value)} onFocus={selectOnFocus} onKeyDown={handleManualEnter} placeholder="0" />
                  </div>
                  <div className="fg-quick-field">
                    <label className="text-label">Fat</label>
                    <input type="number" step="0.1" className="input-field" value={qF} onChange={(e) => setQF(e.target.value)} onFocus={selectOnFocus} onKeyDown={handleManualEnter} placeholder="0" />
                  </div>
                  <div className="fg-quick-field">
                    <label className="text-label">Carbs</label>
                    <input type="number" step="0.1" className="input-field" value={qC} onChange={(e) => setQC(e.target.value)} onFocus={selectOnFocus} onKeyDown={handleManualEnter} placeholder="0" />
                  </div>
                </div>

                {/* COMMIT */}
                <Button className="btn-green fg-quick-cta" onClick={handleAddQuickToPlate} disabled={!qName.trim() || !qKcal}>
                  <Plus className="w-4 h-4" /> Add to plate
                </Button>
              </div>
            </div>
          ) : (
            /* SCAN PANEL — live-camera primary, file upload as a fallback. On a
               decode hit we add the matched food to the collection; on a miss the
               inline card below offers to create a new food prefilled with the
               decoded UPC. */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "1rem 0.5rem" }}>
              {/* SCAN ICON */}
              <ScanBarcode size={48} style={{ color: "var(--color-secondary)" }} />

              {/* SCAN INSTRUCTIONS */}
              <div style={{ textAlign: "center", color: "var(--color-secondary)", fontSize: "0.9375rem", maxWidth: "20rem" }}>
                Point your camera at the package barcode (UPC/EAN). It scans automatically.
              </div>

              {/* PRIMARY: live-camera scanner button. */}
              <Button className="btn-blue" onClick={() => setIsLiveScannerOpen(true)} disabled={isScanningBarcode}>
                <Camera className="w-4 h-4" /> Open camera
              </Button>

              {/* FALLBACK: photo upload. */}
              <Button className="btn-link" onClick={() => barcodeInputRef.current?.click()} disabled={isScanningBarcode}>
                {isScanningBarcode ? "Reading…" : "or upload a photo"}
              </Button>

              {/* HIDDEN FILE INPUT — `capture="environment"` on mobile opens the back camera. */}
              <input
                ref={barcodeInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanBarcodeFile(file);
                }}
              />

              {/* MISS RESULT — show the decoded UPC + a CTA to create a food with it prefilled */}
              {lastScanMissed && lastScannedUpc && (
                <div
                  style={{
                    width: "100%",
                    marginTop: "0.5rem",
                    padding: "0.75rem 0.875rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "var(--card-bg)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "var(--color-secondary)" }}>
                    No food in your library matches:
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "1rem" }}>{lastScannedUpc}</div>
                  <Button className="btn-blue" onClick={() => openCreateWizard({ barcode: lastScannedUpc })}>
                    <Plus className="w-4 h-4" /> Create food with this UPC
                  </Button>
                </div>
              )}
            </div>
          )}

      {/* CREATE-FOOD WIZARD — fullscreen overlay over the logger. Launched by the
          Add tab, the search "Create X" CTA, or the barcode-scan-miss CTA. On
          completion the new food is staged onto the plate (handleWizardCreated). */}
      {createDraft !== null && (
        <CreateFoodWizard
          overlay
          initialName={createDraft.name}
          initialBarcode={createDraft.barcode}
          initialDraft={createDraft.draft}
          initialSourceUrl={createDraft.sourceUrl}
          initialImageUrl={createDraft.imageUrl}
          onCreated={handleWizardCreated}
          onCancel={handleWizardCancel}
        />
      )}

      {isLiveScannerOpen && (
        <LiveBarcodeScanner
          onDecode={handleLiveBarcode}
          onClose={() => setIsLiveScannerOpen(false)}
          onFallbackToUpload={() => barcodeInputRef.current?.click()}
        />
      )}

      {/* FOOD DETAILS SHEET — row-body tap; drafts amount/unit, commits on Add */}
      {previewFood && (
        <FoodDetailsSheet
          rawFood={previewFood}
          existing={collection.find((c) => c.food.id === previewFood.id) ?? null}
          dailyKcalTarget={dailyKcalTarget}
          dailyProteinTarget={dailyProteinTarget}
          dailyFatTarget={dailyFatTarget}
          dailyCarbsTarget={dailyCarbsTarget}
          onCommit={commitFromSheet}
          onClose={() => setPreviewFood(null)}
        />
      )}
    </Modal>
  );
}

/* ============================================================
   UNIT OPTIONS — fetched from food_units DB table, cached at module scope.
   ============================================================ */

let __unitsCache: UnitOption[] | null = null;
let __unitsPromise: Promise<UnitOption[]> | null = null;

function prefetchUnits(): Promise<UnitOption[]> {
  if (__unitsCache) return Promise.resolve(__unitsCache);
  if (!__unitsPromise) {
    __unitsPromise = fetch(`/modules/forage/api/units`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        __unitsCache = Array.isArray(d) ? d.map((u: any) => ({ id: u.id, name: u.name })) : [];
        return __unitsCache;
      })
      .catch(() => {
        __unitsCache = [];
        return __unitsCache;
      });
  }
  return __unitsPromise;
}

function useUnits(): UnitOption[] {
  const [units, setUnits] = useState<UnitOption[]>(__unitsCache ?? []);
  useEffect(() => {
    if (__unitsCache) {
      if (units.length === 0) setUnits(__unitsCache);
      return;
    }
    prefetchUnits().then((u) => setUnits(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return units;
}

/* ============================================================
   NUTRIENT OPTIONS — fetched from nutrients DB table, cached at module scope.
   ============================================================ */

let __nutrientsCache: Nutrient[] | null = null;
let __nutrientsPromise: Promise<Nutrient[]> | null = null;

export function prefetchNutrients(): Promise<Nutrient[]> {
  if (__nutrientsCache) return Promise.resolve(__nutrientsCache);
  if (!__nutrientsPromise) {
    __nutrientsPromise = fetch(`/modules/forage/api/nutrients`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        __nutrientsCache = Array.isArray(d) ? (d as Nutrient[]) : [];
        return __nutrientsCache;
      })
      .catch(() => {
        __nutrientsCache = [];
        return __nutrientsCache;
      });
  }
  return __nutrientsPromise;
}

export function useNutrients(): Nutrient[] {
  const [nutrients, setNutrients] = useState<Nutrient[]>(__nutrientsCache ?? []);
  useEffect(() => {
    if (__nutrientsCache) {
      if (nutrients.length === 0) setNutrients(__nutrientsCache);
      return;
    }
    prefetchNutrients().then((n) => setNutrients(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return nutrients;
}

/* ============================================================
   NUTRIENT TARGETS — the user's resolved per-nutrient bands (active program
   override, else FDA default). Cached at module scope so a food/recipe detail
   never flashes the FDA-default band before the program bands land. `loaded`
   lets callers hold the bar until the real bands are known.
   ============================================================ */

let __targetsCache: ResolvedNutrientTarget[] | null = null;
let __targetsPromise: Promise<ResolvedNutrientTarget[]> | null = null;

export function prefetchNutrientTargets(): Promise<ResolvedNutrientTarget[]> {
  if (__targetsCache) return Promise.resolve(__targetsCache);
  if (!__targetsPromise) {
    __targetsPromise = fetch(`/modules/forage/api/nutrient-targets`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        __targetsCache = Array.isArray(d) ? (d as ResolvedNutrientTarget[]) : [];
        return __targetsCache;
      })
      .catch(() => {
        __targetsCache = [];
        return __targetsCache;
      });
  }
  return __targetsPromise;
}

// Returns the resolved bands plus a `loaded` flag (true the instant the cache is
// warm). Callers should gate band rendering on `loaded` so a cold first open
// shows the bare value rather than a wrong FDA-default band.
export function useNutrientTargets(): { bands: ResolvedNutrientTarget[]; loaded: boolean } {
  const [bands, setBands] = useState<ResolvedNutrientTarget[]>(__targetsCache ?? []);
  const [loaded, setLoaded] = useState<boolean>(__targetsCache != null);
  useEffect(() => {
    if (__targetsCache) {
      if (!loaded) { setBands(__targetsCache); setLoaded(true); }
      return;
    }
    prefetchNutrientTargets().then((b) => { setBands(b); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { bands, loaded };
}

/* ============================================================
   SERVING TABLE — used by FoodModal (create + edit) and the inline log editor.
   Columns: Amount | Unit-dropdown | Remove. Single "1 serving =" header
   is owned by the parent (one label for the whole table).
   ============================================================ */

export function ServingTable({
  rows,
  onChange,
  onRemove,
  rowIdPrefix,
  nextIdAfter,
  advanceOnEnter,
}: {
  rows: { unit: string; ups: string }[];
  onChange: (i: number, patch: { unit?: string; ups?: string }) => void;
  onRemove: (i: number) => void;
  rowIdPrefix: string;
  nextIdAfter?: (i: number) => string | null;
  advanceOnEnter?: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, nextId: string | null) => void;
}) {
  const units = useUnits();
  return (
    /* SERVING TABLE */
    <table className="compact-edit-table">
      <tbody>
        {rows.map((s, i) => {
          const nextId = nextIdAfter?.(i) ?? null;
          // If the stored unit is no longer in the DB list, keep it visible as a stale option
          const inList = units.some((u) => u.name === s.unit);
          return (
            <tr key={i}>
              <td>
                <input
                  id={`${rowIdPrefix}-${i}-ups`}
                  className="input-field"
                  type="number"
                  step="1"
                  value={s.ups}
                  onChange={(e) => onChange(i, { ups: e.target.value })}
                  onFocus={selectOnFocus}
                  onKeyDown={advanceOnEnter ? (e) => advanceOnEnter(e, nextId) : undefined}
                  placeholder="amount"
                />
              </td>
              <td>
                <select
                  className="input-field"
                  value={s.unit}
                  onChange={(e) => onChange(i, { unit: e.target.value })}
                  onKeyDown={advanceOnEnter ? (e) => advanceOnEnter(e, nextId) : undefined}
                >
                  {!inList && s.unit && <option value={s.unit}>{s.unit}</option>}
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <Button className="btn-link-red" onClick={() => onRemove(i)} aria-label="Remove unit">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ============================================================
   NUTRIENT EDITOR — collapsible section grouped by category.
   Used inside FoodModal. Empty input = "not entered" (won't be saved as 0).
   ============================================================ */

// Shared row layout for both macros (kcal/fat/carbs/protein, stored as their
// own columns on `foods`) and micros (nutrient EAV rows). The form mirrors the
// physical FDA Nutrition Facts panel — same label text, same indentation, same
// top-to-bottom order — so values can be transcribed straight from a label.
export function NutritionRow({
  id,
  label,
  unit,
  value,
  onChange,
  indent = 0,
  bold = false,
  dailyValue = null,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
  indent?: 0 | 1 | 2;
  bold?: boolean;
  // FDA Daily Value for this nutrient/macro, in the same unit as `unit`. When set
  // (and > 0), the unit suffix becomes a tappable toggle that flips the input
  // into "percent of DV" mode. Stays null for nutrients without a published DV
  // (trans fat, total sugar, caffeine) — toggle is suppressed in that case.
  dailyValue?: number | null;
}) {
  // Per-row input mode. Lives inside NutritionRow so toggling one row does not
  // affect any other row. Source of truth is always the amount (the `value` prop
  // and `onChange` callback both operate in the row's `unit`); percent is purely
  // an input convenience that is converted on entry.
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  // Displayed digits while in % mode. Seeded from the stored amount when the
  // row is flipped into % mode (so the user sees what the current amount is as
  // a %DV); thereafter tracks literal keystrokes so 2-dp rounding doesn't make
  // the input flicker mid-type. Toggling does NOT mutate the stored amount —
  // amount stays the source of truth.
  const [percentDraft, setPercentDraft] = useState("");
  const canToggle = typeof dailyValue === "number" && dailyValue > 0;

  function handleInputChange(next: string) {
    if (mode === "amount") {
      onChange(next);
      return;
    }
    // Percent mode: parse what the user typed as a %DV and store the absolute
    // amount. Empty string clears the stored amount.
    setPercentDraft(next);
    if (next === "") {
      onChange("");
      return;
    }
    const pct = parseFloat(next);
    if (!Number.isFinite(pct) || !canToggle) return;
    const amount = Math.round((pct / 100) * (dailyValue as number) * 1000) / 1000;
    onChange(String(amount));
  }

  function handleToggle() {
    if (!canToggle) return;
    // Toggling never writes to the stored amount. When flipping INTO % mode,
    // seed the draft from the current amount so the field shows the equivalent
    // %DV instead of being blank — this is display-only and round-trip-safe
    // because the amount remains the source of truth.
    if (mode === "amount") {
      const amt = parseFloat(value);
      if (Number.isFinite(amt) && amt > 0) {
        const pct = Math.round((amt / (dailyValue as number)) * 10000) / 100;
        setPercentDraft(String(pct));
      } else {
        setPercentDraft("");
      }
      setMode("percent");
    } else {
      setMode("amount");
    }
  }

  const displayUnit = mode === "percent" ? "%" : unit;
  const displayValue = mode === "percent" ? percentDraft : value;

  return (
    /* NUTRITION ROW */
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        paddingLeft: `${indent * 1.25}rem`,
      }}
    >
      <label
        htmlFor={id}
        style={{
          flex: 1,
          fontSize: "0.8125rem",
          color: "var(--color-primary)",
          fontWeight: bold ? 600 : 400,
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative", width: "8rem" }}>
        <input
          id={id}
          className="input-field"
          type="number"
          step="0.01"
          min="0"
          value={displayValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={selectOnFocus}
          placeholder="—"
          style={{ paddingRight: "2.25rem", textAlign: "right" }}
        />
        {canToggle ? (
          /* UNIT TOGGLE — flips this row only between absolute and %DV input.
             onMouseDown preventDefault stops the button from stealing focus
             from the adjacent <input>; on mobile this keeps the soft keyboard
             open so the user can immediately type a new value after tapping.
             tabIndex={-1} keeps the toggle out of the keyboard-nav tab order. */
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggle}
            aria-label={mode === "amount" ? `Switch to % of Daily Value` : `Switch to ${unit}`}
            style={{
              position: "absolute",
              right: "0.5rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              padding: "0.125rem 0.25rem",
              margin: 0,
              color: mode === "percent" ? "var(--color-primary)" : "var(--color-gray)",
              fontSize: "0.75rem",
              cursor: "pointer",
              textDecoration: "underline dotted",
              textUnderlineOffset: "2px",
              fontWeight: mode === "percent" ? 600 : 400,
            }}
          >
            {displayUnit}
          </button>
        ) : (
          <span
            style={{
              position: "absolute",
              right: "0.625rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-gray)",
              fontSize: "0.75rem",
              pointerEvents: "none",
            }}
          >
            {displayUnit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   FOOD MODAL — create + edit (unified)
   ============================================================ */

export interface ServingDraft {
  unit: string;
  ups: string; // units_per_serving as a string for the input
}

/* ============================================================
   CREATE FOOD WIZARD — stepped create flow (Details → Servings → Nutrition).
   Reused by BOTH the dedicated /library/new page and the food-logger Add tab.
   It NEVER navigates on its own: on a successful POST it calls onCreated(food)
   and lets the caller decide what happens next (route to the food detail page,
   or — in the logger — stage the new food onto the plate). Render with
   `overlay` to lay it fullscreen over the logger modal.
   ============================================================ */

// Reference basis the user enters nutrition against. "serving" = one named
// serving (user defines the units); "100g"/"100ml" = per-100 of a base unit.
type WizardBasis = "serving" | "100g" | "100ml";

// round to decimal(10,4) — the food_servings.units_per_serving column scale.
const round4Wizard = (n: number) => Math.round(n * 1e4) / 1e4;

// Success message for a source-link import. Retailer sites increasingly wall off
// server-side reads (H-E-B, Walmart), and the import then matches the product in
// Open Food Facts instead — community data rather than the brand's own page, so
// say which one filled the form and prompt a check.
function importedFromMessage(draft: { data_source?: string }): string {
  return draft.data_source === "openfoodfacts"
    ? "Website blocked - using Open Food Facts as fallback"
    : "Imported from link";
}

// Wizard step order. Kept as a const so the progress bar length and the
// next/back guards stay in sync.
const WIZARD_STEPS = ["Details", "Nutrition"] as const;
const WIZARD_TOTAL_STEPS = WIZARD_STEPS.length;

// SCAN TILE — one single-purpose scan button in the details-slide scan row.
// Sharp-cornered dashed tile (static element) that flips to a solid green border
// + check badge once `filled` is true, signalling its target fields now hold
// data (even data that lives on a later slide, e.g. nutrition from the label
// scan). When `suspicious` is set the badge instead flips to an amber warning
// triangle (and the border goes amber), flagging a captured-but-questionable
// scan — e.g. a label whose calories don't reconcile with its macros — so the
// numbers get re-checked before saving.
function ScanTile({
  icon: Icon,
  label,
  filled,
  busy,
  onClick,
  suspicious = false,
  fullWidth = false,
}: {
  icon: LucideIcon;
  label: string;
  filled: boolean;
  busy: boolean;
  onClick: () => void;
  // Captured data looks questionable (likely OCR misscan) — show a warning
  // badge instead of the confirming check. Only meaningful when `filled`.
  suspicious?: boolean;
  // Stretch to fill its container (used as a lone full-width tile on slide 2)
  // instead of sitting in the equal-columns scan row on slide 1.
  fullWidth?: boolean;
}) {
  // A captured-but-suspect scan is still "filled" — surface the warning state.
  const warn = filled && suspicious;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.375rem",
        padding: "0.875rem 0.375rem",
        minHeight: 88,
        width: fullWidth ? "100%" : undefined,
        border: warn
          ? "2px solid var(--alert-yellow-text)"
          : filled
            ? "2px solid var(--btn-green-bg)"
            : "2px dashed var(--card-border)",
        background: "var(--hover-bg)",
        color: "var(--color-primary)",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "0.8125rem",
        textAlign: "center",
        lineHeight: 1.2,
      }}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
      <span>{label}</span>

      {/* DATA BADGE — green check confirming the tile's fields are populated,
          or an amber warning triangle when the captured data looks like a
          misscan (numbers that don't reconcile) and should be double-checked. */}
      {filled && (
        <span
          aria-label={warn ? "possible misscan — double-check values" : "captured"}
          title={warn ? "Possible misscan — double-check the captured values" : undefined}
          style={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "9999px", background: warn ? "var(--alert-yellow-text)" : "var(--btn-green-bg)", color: warn ? "var(--alert-yellow-bg)" : "var(--btn-green-text)" }}
        >
          {warn ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        </span>
      )}
    </button>
  );
}

export function CreateFoodWizard({
  initialName,
  initialBarcode,
  initialDraft,
  initialSourceUrl,
  initialImageUrl,
  overlay = false,
  onCreated,
  onCancel,
}: {
  // Pre-fills the name field (e.g. from the search "Create X" CTA).
  initialName?: string;
  // Pre-fills the UPC field (e.g. from a barcode-scan miss).
  initialBarcode?: string;
  // Pre-fills the WHOLE form — identity plus nutrition — from an already-parsed
  // draft (an Open Food Facts search pick). Applied through the same
  // applyFoodDraft path a label scan uses, so there's one way in.
  initialDraft?: LabelOcrDraft;
  // Pre-fills the source link — the record the draft above was read from.
  initialSourceUrl?: string;
  // Product photo to download on save, when the draft's source carried one.
  initialImageUrl?: string | null;
  // When true, renders as a fixed fullscreen overlay (used over the logger
  // modal); otherwise fills its container as a page (used on /library/new).
  overlay?: boolean;
  // Called with the saved food after a successful POST. The wizard does NOT
  // navigate — the caller routes or stages as appropriate.
  onCreated: (food: Food) => void;
  // Called when the user cancels (header X).
  onCancel: () => void;
}) {
  // DATA
  const nutrients = useNutrients();
  const router = useRouter();

  // INPUT
  const [name, setName] = useState(initialName ?? "");
  const [brand, setBrand] = useState("");
  // UPC / barcode (no validation beyond trim — labels carry 8/12/13/14-digit codes).
  const [barcodeUpc, setBarcodeUpc] = useState(initialBarcode ?? "");
  // Source link — the product/nutrition page this food came from. Stored on the
  // food (foods.source_url) and re-read by the detail page's Resync action.
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl ?? "");
  // Product photo to download on save (Open Food Facts pick / URL import). The
  // server fetches it — the browser never loads the third-party image.
  const [imageSourceUrl, setImageSourceUrl] = useState<string | null>(initialImageUrl ?? null);
  // STATE — when set, the food is saved to the SHARED library (user_id NULL) so
  // every user can log it. Defaults on for imported products, which are
  // objectively packaged goods rather than someone's own recipe.
  const [isGlobal, setIsGlobal] = useState(!!initialImageUrl || !!initialSourceUrl);
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [servings, setServings] = useState<ServingDraft[]>([{ unit: "g", ups: "" }]);
  // Nutrition reference basis + the optional single portion (100g/100ml bases).
  const [basis, setBasis] = useState<WizardBasis>("serving");
  const [portionAmount, setPortionAmount] = useState(""); // weight/volume of one portion, in the base unit
  const [portionQty, setPortionQty] = useState("1");      // how many <portionName> make that portion
  const [portionName, setPortionName] = useState("");     // e.g. "bottle", "pieces"
  // nutrientAmounts is keyed by nutrient.id. Empty string = "not entered" (won't be saved).
  const [nutrientAmounts, setNutrientAmounts] = useState<Record<string, string>>({});
  // Preseeded icon code from FOOD_ICONS. null = use the default (apple).
  const [icon, setIcon] = useState<string | null>(null);

  // STATE
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  // Existing food that already owns the current barcode (own library or a global),
  // looked up live as the UPC changes. Non-null → block the create as a duplicate.
  const [dupFood, setDupFood] = useState<{ id: string; name: string } | null>(null);
  // Nutrition-label OCR (scan/upload on the Nutrition step). Independent of the
  // front-of-product scan below so one pipeline's spinner never bleeds onto the
  // other tile.
  const [isScanningLabel, setIsScanningLabel] = useState(false);
  // Single-image nutrition-label scan (Nutrition slide).
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  // Scan-front-of-product (Details slide) — fills name / brand. Its own in-flight
  // flag + input so it runs as a completely separate pipeline from the label scan.
  const [isScanningFront, setIsScanningFront] = useState(false);
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  // True once a scan returned nutrition from a real facts panel with a stated
  // serving size. Gates the "Scan label" tile's captured-check so a stray
  // front-of-pack macro claim never lights it.
  const [servingSizeStated, setServingSizeStated] = useState(false);
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  // Source-link import (scrape the pasted URL) — its own in-flight flag so it
  // never shares a spinner with either photo pipeline.
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  // Desktop = a precise pointer + hover (mouse/keyboard), where Ctrl/⌘+V image
  // paste applies. Drives the paste hint on the Nutrition step. Defaults false
  // for SSR (no matchMedia on the server); resolved on mount.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  // Code → Nutrient lookup so the macro block can resolve label metadata
  // (id, unit) for each inline row without scanning the array repeatedly.
  const nutrientByCode = useMemo(() => {
    const map = new Map<string, Nutrient>();
    for (const n of nutrients) map.set(n.code, n);
    return map;
  }, [nutrients]);

  // Tail groups below the Nutrition Facts panel — Vitamins / Minerals / Other,
  // grouped + ordered by the ledger's FDA label scheme (the panel above renders the
  // rest, incl. the four required micros). Each scheme micro code maps to its DB
  // nutrient; codes absent from the reference set (e.g. unseeded creatine) drop.
  const fdaTailGroups = useMemo(
    () =>
      resolveScheme(FDA_LABEL_SCHEME)
        .filter((section) => section.heading !== "Nutrition Facts")
        .map((section) => ({
          heading: section.heading,
          nutrients: section.items
            .filter((item): item is Extract<ResolvedItem, { kind: "micro" }> => item.kind === "micro")
            .map((item) => nutrientByCode.get(item.code))
            .filter((n): n is Nutrient => !!n),
        }))
        .filter((group) => group.nutrients.length > 0),
    [nutrientByCode]
  );

  // Render one generic nutrient row bound to the nutrientAmounts map by id.
  const renderNutrientRow = (n: Nutrient) => (
    <NutritionRow
      key={n.id}
      id={`ef-nut-${n.id}`}
      label={n.name}
      unit={n.unit}
      dailyValue={n.daily_value}
      value={nutrientAmounts[n.id] ?? ""}
      onChange={(v) => {
        setNutrientAmounts((prev) => {
          const next = { ...prev };
          if (v === "") delete next[n.id];
          else next[n.id] = v;
          return next;
        });
      }}
    />
  );

  function readMicro(code: string): string {
    const n = nutrientByCode.get(code);
    if (!n) return "";
    return nutrientAmounts[n.id] ?? "";
  }

  function writeMicro(code: string, value: string) {
    const n = nutrientByCode.get(code);
    if (!n) return;
    setNutrientAmounts((prev) => {
      const next = { ...prev };
      // Empty string = "not entered" (omit row). An explicit "0" is meaningful
      // ("0g trans fat" on a real label) and must round-trip — keep it.
      if (value === "") delete next[n.id];
      else next[n.id] = value;
      return next;
    });
  }

  function microUnit(code: string, fallback: string): string {
    return nutrientByCode.get(code)?.unit ?? fallback;
  }

  // Returns the FDA Daily Value for a nutrient code, or null if no DV is published.
  function microDV(code: string): number | null {
    return nutrientByCode.get(code)?.daily_value ?? null;
  }

  // APPLY DRAFT — shared by every auto-fill source (label/front photo scan and
  // the source-link import), which all hand back the same LabelOcrDraft shape.
  // A numeric value (including 0) came from the source; `null` means the field
  // wasn't present, so the user's existing input is left alone.
  function applyFoodDraft(draft: LabelOcrDraft) {
    if (draft.name) setName(draft.name);
    if (draft.brand) setBrand(draft.brand);
    // UPC read off the barcode (front or back of the package) — zbar-decoded
    // server-side with the vision LLM's printed-digit read as a fallback.
    if (draft.barcode_upc) setBarcodeUpc(draft.barcode_upc);
    // Icon the model picked for this product (e.g. "cup-soda"). Applied like
    // name/brand — it's identity, not nutrition, so no serving-size gate.
    if (draft.icon) setIcon(draft.icon);

    // NUTRITION — only trusted when the source carried a real facts panel with a
    // stated serving size (server-enforced). Front-of-pack marketing claims
    // ("24g PROTEIN!") arrive with serving_size_stated=false and are ignored,
    // so they never fill fields or light the label tile's captured-check.
    if (!draft.serving_size_stated) return;
    setServingSizeStated(true);
    if (draft.kcal_per_serving !== null) setKcal(String(draft.kcal_per_serving));
    if (draft.protein_g_per_serving !== null) setP(String(draft.protein_g_per_serving));
    if (draft.carbs_g_per_serving !== null) setC(String(draft.carbs_g_per_serving));
    if (draft.fat_g_per_serving !== null) setF(String(draft.fat_g_per_serving));
    // Replace serving rows from the draft when the basis is per-serving; an
    // empty result leaves the existing draft rows untouched.
    const draftServings = draft.servings
      .filter((s) => Number.isFinite(s.units_per_serving) && s.units_per_serving > 0 && s.unit)
      .map((s) => ({ unit: s.unit, ups: String(s.units_per_serving) }));
    if (basis === "serving" && draftServings.length > 0) {
      setServings(draftServings);
    }
    if (Object.keys(draft.nutrients_by_code).length > 0) {
      const byId: Record<string, string> = {};
      for (const n of nutrients) {
        const amt = draft.nutrients_by_code[n.code];
        // >= 0 so explicit label zeros ("Trans Fat 0g") propagate as "0".
        if (typeof amt === "number" && amt >= 0) byId[n.id] = String(amt);
      }
      setNutrientAmounts(byId);
    }
  }

  // PRE-FILL FROM A READY-MADE DRAFT (Open Food Facts search pick). Waits for
  // useNutrients() to resolve, because applyFoodDraft maps nutrient CODES onto
  // nutrient ids — applying before they load would silently drop every
  // micronutrient. Runs once; after that the form belongs to the user.
  const appliedInitialDraftRef = useRef(false);
  useEffect(() => {
    if (!initialDraft || appliedInitialDraftRef.current || nutrients.length === 0) return;
    appliedInitialDraftRef.current = true;
    applyFoodDraft(initialDraft);
  }, [initialDraft, nutrients.length]);

  // IMPORT FROM SOURCE LINK — scrapes the pasted product/nutrition page and fills
  // the form from it, the same way a label scan does (mirrors the recipe "Import
  // from website" flow, but leaves the result on the form to review rather than
  // creating the record outright).
  async function handleImportFromUrl() {
    const url = sourceUrl.trim();
    if (!url || isImportingUrl) return;
    setIsImportingUrl(true);
    const toastId = toast.loading("Reading page…");
    try {
      const res = await fetch(`/modules/forage/api/foods/import-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const draft = await res.json();
      if (!res.ok) {
        toast.error(draft?.error || "Couldn't read that link", { id: toastId });
        return;
      }
      applyFoodDraft(draft as LabelOcrDraft);
      // An imported product is a packaged good rather than a personal recipe, so
      // it defaults to the shared library — and brings its photo with it.
      if (draft.image_url) setImageSourceUrl(draft.image_url);
      setIsGlobal(true);
      if (draft.serving_size_stated) toast.success(importedFromMessage(draft), { id: toastId });
      else toast.error("No nutrition found on that page", { id: toastId });
    } catch {
      toast.error("Couldn't read that link", { id: toastId });
    } finally {
      setIsImportingUrl(false);
    }
  }

  // SCAN/UPLOAD IMAGE — routes through the label-OCR endpoint and applies the
  // parsed draft to the form. `kind` selects the pipeline: the front-of-product
  // scan and the nutrition-label scan are fully independent (their own spinner)
  // so one never blocks or visually hijacks the other. Both apply whatever
  // fields the vision LLM extracts via applyFoodDraft above.
  async function handleScanLabelFile(fileOrFiles: File | File[], kind: "front" | "label" = "label") {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    if (files.length === 0) return;
    const setBusy = kind === "front" ? setIsScanningFront : setIsScanningLabel;
    setBusy(true);
    const toastId = toast.loading("Scanning…");
    try {
      const form = new FormData();
      for (const file of files) form.append("image", file);
      const res = await fetch(`/modules/forage/api/label-ocr`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Couldn't read the photo", { id: toastId });
        return;
      }
      const draft: LabelOcrDraft = await res.json();
      applyFoodDraft(draft);
      // The green check on each tile shows exactly what landed, so the toast just
      // confirms the scan worked — or says so plainly when nothing usable was read.
      const captured = !!draft.name || !!draft.brand || !!draft.barcode_upc || draft.serving_size_stated;
      if (captured) toast.success("Scanned", { id: toastId });
      else toast.error("Nothing found — try a clearer photo", { id: toastId });
    } catch {
      toast.error("Couldn't read the photo", { id: toastId });
    } finally {
      setBusy(false);
      if (kind === "front") {
        if (frontInputRef.current) frontInputRef.current.value = "";
      } else {
        if (labelInputRef.current) labelInputRef.current.value = "";
      }
    }
  }

  // PASTE-TO-SCAN — on the Details (0) or Nutrition (2) step, a pasted clipboard
  // image (e.g. a screenshot of a label) is routed through the same OCR flow as
  // the scan/upload button. Scoped to those two steps (both expose a scan
  // button) so paste elsewhere is untouched, and skipped while a scan is already
  // in flight.
  useEffect(() => {
    if (step !== 0 && step !== 1) return;
    function onPaste(e: ClipboardEvent) {
      if (isScanningLabel) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItem = Array.from(items).find((it) => it.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (file) {
        e.preventDefault();
        void handleScanLabelFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step, isScanningLabel, basis, nutrients]);

  // DUPLICATE-BARCODE LOOKUP — whenever the UPC changes, debounce a lookup against
  // the library (own + global). A hit means creating this food would duplicate an
  // existing one, so we surface it inline and block the save (server enforces too).
  useEffect(() => {
    const upc = barcodeUpc.trim();
    if (!upc) {
      setDupFood(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/modules/forage/api/foods?barcode=${encodeURIComponent(upc)}`);
        if (!res.ok) return;
        const matches: Food[] = await res.json();
        if (cancelled) return;
        const hit = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
        setDupFood(hit ? { id: hit.id, name: hit.name } : null);
      } catch {
        // best-effort — the server-side 409 is the authoritative block.
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [barcodeUpc]);

  // SCAN BARCODE PHOTO — routes through zbarimg on the server; only sets the
  // barcode field, leaving the rest of the form alone.
  async function handleScanBarcodeFile(file: File) {
    setIsScanningBarcode(true);
    const toastId = toast.loading("Reading barcode…");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/modules/forage/api/barcode-scan`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to read barcode", { id: toastId });
        return;
      }
      const draft: { barcode_upc: string | null; symbology: string | null } = await res.json();
      if (!draft.barcode_upc) {
        toast.error("No barcode detected — try a clearer photo", { id: toastId });
        return;
      }
      setBarcodeUpc(draft.barcode_upc);
      toast.success(`Barcode read${draft.symbology ? ` (${draft.symbology})` : ""}`, { id: toastId });
    } catch {
      toast.error("Failed to read barcode", { id: toastId });
    } finally {
      setIsScanningBarcode(false);
      if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    }
  }

  function addServing() {
    setServings((prev) => [...prev, { unit: "g", ups: "" }]);
  }
  function updateServing(i: number, patch: Partial<ServingDraft>) {
    setServings((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeServing(i: number) {
    setServings((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Build the serving rows to persist from the chosen basis (see /library/new
  // for the full rationale — identical logic).
  function buildSaveServings(): { unit: string; units_per_serving: number }[] {
    if (basis === "serving") {
      return servings
        .map((s) => ({ unit: (s.unit ?? "").trim(), units_per_serving: Number(s.ups) }))
        .filter((s) => s.unit && Number.isFinite(s.units_per_serving) && s.units_per_serving > 0);
    }
    const baseUnit = basis === "100g" ? "g" : "ml";
    const rows: { unit: string; units_per_serving: number }[] = [{ unit: baseUnit, units_per_serving: 100 }];
    const amount = Number(portionAmount);
    const qty = Number(portionQty || "1");
    const pname = portionName.trim();
    if (pname && Number.isFinite(amount) && amount > 0 && Number.isFinite(qty) && qty > 0) {
      rows.push({ unit: pname, units_per_serving: round4Wizard((100 * qty) / amount) });
    }
    return rows;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name required");
      setStep(0);
      return;
    }
    if (!kcal) {
      toast.error("kcal required");
      setStep(1);
      return;
    }
    if (dupFood) {
      toast.error(`Already in your library: ${dupFood.name}`);
      setStep(0);
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/modules/forage/api/foods`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          barcode_upc: barcodeUpc.trim() || null,
          source_url: sourceUrl.trim() || null,
          image_source_url: imageSourceUrl,
          is_global: isGlobal,
          kcal_per_serving: Number(kcal),
          protein_g_per_serving: Number(p || 0),
          carbs_g_per_serving: Number(c || 0),
          fat_g_per_serving: Number(f || 0),
          icon,
          omit_default_serving: basis !== "serving",
          servings: buildSaveServings(),
          nutrients: Object.entries(nutrientAmounts)
            .map(([nutrient_id, amount]) => ({ nutrient_id, amount: Number(amount) }))
            .filter((n) => Number.isFinite(n.amount) && n.amount >= 0),
        }),
      });
      if (res.status === 409) {
        // Server caught a duplicate barcode (race with / ahead of the inline
        // lookup). Surface the existing food and keep the user on details.
        const body = await res.json().catch(() => ({}));
        if (body?.existing?.id) setDupFood({ id: body.existing.id, name: body.existing.name });
        toast.error(body?.existing?.name ? `Already in your library: ${body.existing.name}` : "That barcode is already in your library");
        setStep(0);
        return;
      }
      if (!res.ok) {
        toast.error("Failed to create food");
        return;
      }
      const saved: Food = await res.json();
      toast.success("Food created");
      onCreated(saved);
    } catch {
      toast.error("Failed to create food");
    } finally {
      setIsSaving(false);
    }
  }

  const isLastStep = step === WIZARD_TOTAL_STEPS - 1;

  // Advance one slide; slides are freely navigable. Required-field validation
  // happens only at submit (handleSave jumps back to the offending step).
  function handleNext() {
    if (isLastStep) {
      void handleSave();
      return;
    }
    setStep((s) => Math.min(s + 1, WIZARD_TOTAL_STEPS - 1));
  }

  const CurrentIcon = resolveFoodIcon(icon);

  // SCAN-STATUS INDICATORS — each scan button lights a check once its target
  // fields hold data, so data captured by a scan (e.g. nutrition from the label
  // scan) is visible from the details slide even though those fields live on the
  // next slide.
  const frontHasData = name.trim() !== "" || brand.trim() !== "";
  // Label check requires BOTH a stated serving size (real facts panel, not a
  // marketing claim) AND at least one nutrition value actually captured.
  const labelHasData =
    servingSizeStated &&
    (kcal !== "" || p !== "" || c !== "" || f !== "" || Object.keys(nutrientAmounts).length > 0);
  const barcodeHasData = barcodeUpc.trim() !== "";

  // MISSCAN HEURISTICS — captured label data that doesn't reconcile usually
  // means the OCR misread a digit. When any of these fire the label scan tile
  // shows an amber warning instead of the green check, prompting a re-check
  // before saving. Two cheap sanity checks (per the feature request):
  //   1. ATWATER MISMATCH — stated calories are >5% off from the calories
  //      implied by the macros (4·protein + 4·carb + 9·fat).
  //   2. ABSURD MICRONUTRIENT — an entered nutrient exceeds 2000% of its
  //      Daily Value (e.g. a dropped decimal turning 80mcg into 80000mcg).
  const labelLooksSuspect =
    labelHasData &&
    (() => {
      // ATWATER MISMATCH — needs all four macro figures to compare against kcal.
      const kcalNum = parseFloat(kcal);
      const proteinNum = parseFloat(p);
      const carbsNum = parseFloat(c);
      const fatNum = parseFloat(f);
      if (
        Number.isFinite(kcalNum) &&
        Number.isFinite(proteinNum) &&
        Number.isFinite(carbsNum) &&
        Number.isFinite(fatNum)
      ) {
        const impliedKcal = proteinNum * 4 + carbsNum * 4 + fatNum * 9;
        if (impliedKcal > 0 && Math.abs(kcalNum - impliedKcal) > impliedKcal * 0.05) {
          return true;
        }
      }

      // ABSURD MICRONUTRIENT — amounts are stored absolute (in each nutrient's
      // unit), so compare directly against 20× the published Daily Value.
      for (const nutrient of nutrients) {
        if (!nutrient.daily_value || nutrient.daily_value <= 0) continue;
        const amount = parseFloat(nutrientAmounts[nutrient.id] ?? "");
        if (Number.isFinite(amount) && amount > nutrient.daily_value * 20) {
          return true;
        }
      }

      return false;
    })();

  // ENTER-TO-ADVANCE (Nutrition step) — focus the next nutrition input, or blur
  // on the last one to close the keyboard. Order is read live from the DOM
  // (visual input order) rather than a hardcoded id list, so it stays correct
  // as the nutrient set changes (e.g. when it moves to a ledger). The hidden
  // label-scan file input is excluded.
  function nutritionEnterAdvance(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT" || (target as HTMLInputElement).type === "file") return;
    e.preventDefault();
    const inputs = Array.from(e.currentTarget.querySelectorAll("input")).filter(
      (el) => el.type !== "file"
    ) as HTMLInputElement[];
    const idx = inputs.indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < inputs.length - 1) {
      const next = inputs[idx + 1];
      next.focus();
      next.select?.();
    } else {
      (target as HTMLInputElement).blur();
    }
  }

  return (
    /* WIZARD SHELL — full-height flex column: sticky header, scrolling body,
       pinned footer. As an overlay it lays fixed over the logger modal. */
    <div
      /* PAGE VARIANT — marker class lets createFood.css lock the body to
         --app-height and let this shell flex into the space left by the navbar
         (mirrors the home.css pattern). Avoids the 61px over-tall page +
         scroll-anchoring "twitch" that minHeight:100dvh caused (it ignored the
         in-flow navbar). The overlay variant is fixed and needs neither. */
      className={overlay ? undefined : "forage-create-page"}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--solid-background)",
        ...(overlay
          ? { position: "fixed", inset: 0, zIndex: 60 }
          : {}),
      }}
    >

      {/* HEADER — close (left), centered title, progress bar below. */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--solid-background)", padding: "0.75rem 1rem 0.5rem" }}>

        {/* HEADER ROW — X left, title centered; X is vertically centered with it. */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <button type="button" onClick={onCancel} aria-label="Cancel" disabled={isSaving} style={{ display: "flex", background: "transparent", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", color: "var(--color-primary)" }}>
            <X className="w-5 h-5" />
          </button>
          <span className="text-page-title" style={{ flex: 1, textAlign: "center" }}>Create Food</span>
          {/* SPACER — balances the close button so the title stays centered. */}
          <span style={{ width: 20 }} />
        </div>

        {/* PROGRESS BAR */}
        <div className="wizard-progress" style={{ marginTop: "0.75rem" }} aria-label={`Step ${step + 1} of ${WIZARD_TOTAL_STEPS}`}>
          {WIZARD_STEPS.map((_, i) => (
            <span key={i} data-filled={i <= step ? "true" : "false"} />
          ))}
        </div>
      </div>

      {/* BODY — full-width scroll region so the scrollbar sits at the viewport's
          right edge (not the centered column's edge). The step content is
          centered/width-capped by the inner CONTENT wrapper below. */}
      <div style={{ flex: 1, overflowY: "auto", width: "100%" }}>

      {/* CONTENT — centered, width-capped column. Extra bottom padding clears the
          floating nav buttons. */}
      <div style={{ padding: "1rem 1rem 6rem", maxWidth: 640, width: "100%", margin: "0 auto" }}>

        {/* STEP 0 — DETAILS */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* SCAN ROW — three single-purpose scanners. Each tile shows a green
                check once its target fields hold data, so you can tell what's been
                captured (e.g. nutrition from the label scan) without leaving this
                slide. Front → name/brand; Label → nutrition; Barcode → UPC. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>

              {/* SCAN FRONT OF PRODUCT — reads the food name + brand off the front. */}
              <ScanTile icon={Package} label="Scan front" filled={frontHasData} busy={isScanningFront} onClick={() => frontInputRef.current?.click()} />

              {/* SCAN LABEL — reads the nutrition facts panel (fields on the next slide). */}
              <ScanTile icon={ScanText} label="Scan label" filled={labelHasData} suspicious={labelLooksSuspect} busy={isScanningLabel} onClick={() => labelInputRef.current?.click()} />

              {/* SCAN BARCODE — opens the live scanner to capture the UPC. */}
              <ScanTile icon={ScanBarcode} label="Scan barcode" filled={barcodeHasData} busy={isScanningBarcode} onClick={() => setIsLiveScannerOpen(true)} />

            </div>

            {/* SCAN HINT — desktop can also paste a clipboard image into a scan. */}
            {isDesktop && (
              <span className="text-muted" style={{ fontSize: "0.75rem", textAlign: "center", marginTop: "-0.5rem" }}>
                or paste an image
              </span>
            )}

            {/* ICON AVATAR — dashed ring with the current food icon + edit pencil. */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: "0.5rem" }}>
              <div style={{ position: "relative", width: 132, height: 132 }}>
                <button
                  type="button"
                  onClick={() => setIsPickingIcon(true)}
                  aria-label="Choose icon"
                  style={{ width: "100%", height: "100%", border: "2px dashed var(--card-border)", background: "transparent", color: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <CurrentIcon size={44} />
                </button>
                {/* EDIT BADGE */}
                <button
                  type="button"
                  onClick={() => setIsPickingIcon(true)}
                  aria-label="Edit icon"
                  style={{ position: "absolute", right: 6, bottom: 6, width: 40, height: 40, border: "none", background: "var(--hover-bg)", color: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* NAME */}
            <div className="flex flex-col gap-1">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <label className="text-label" htmlFor="ef-name">Food Name</label>
                <span className="text-muted" style={{ fontSize: "0.75rem" }}>Required</span>
              </div>
              <input
                id="ef-name"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={focusOnEnter("ef-brand", { select: false })}
                placeholder="Enter food name or description…"
                autoCapitalize="words"
              />
            </div>

            {/* BRAND */}
            <div className="flex flex-col gap-1">
              <label className="text-label" htmlFor="ef-brand">Brand Name (Optional)</label>
              <input
                id="ef-brand"
                className="input-field"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                onKeyDown={blurOnEnter}
                placeholder="Enter brand..."
                autoCapitalize="words"
              />
            </div>

            {/* BARCODE — the "Scan barcode" tile in the scan row above opens the
                live scanner; this is the resulting / manually-typed UPC. */}
            <div className="flex flex-col gap-1">
              <label className="text-label" htmlFor="ef-upc">Barcode</label>

              {/* MANUAL UPC — typed entry / scan result. */}
              <input
                id="ef-upc"
                className="input-field"
                value={barcodeUpc}
                onChange={(e) => setBarcodeUpc(e.target.value)}
                onKeyDown={blurOnEnter}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Scan above or enter UPC manually, e.g. 012345678905"
              />

              {/* DUPLICATE WARNING — this UPC already belongs to a food, so the
                  create is blocked (a second copy would be a duplicate). The name
                  links to that food's detail page — but ONLY in page mode. As an
                  overlay over the logger, navigating away would unmount the
                  in-memory plate (it's never persisted), so there it stays plain
                  text to avoid clearing a staged plate. */}
              {dupFood && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", padding: "0.625rem 0.75rem", border: "1px solid var(--alert-red-border)", background: "var(--alert-red-bg)", color: "var(--alert-red-text)" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    Already in your library:{" "}
                    {overlay ? (
                      dupFood.name
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(`/modules/forage/ui/library/${dupFood.id}`)}
                        style={{ background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
                      >
                        {dupFood.name}
                      </button>
                    )}
                  </span>
                </div>
              )}

              <input
                ref={barcodeInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanBarcodeFile(file);
                }}
              />
            </div>

            {/* SOURCE LINK — the product / nutrition page this food comes from.
                Saved on the food, and "Import" scrapes it to fill the form (the
                same auto-fill path as a label scan). The saved link is what the
                food details page later resyncs from. */}
            <div className="flex flex-col gap-1">
              <label className="text-label" htmlFor="ef-source-url">Source link (Optional)</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                <input
                  id="ef-source-url"
                  className="input-field"
                  type="url"
                  inputMode="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                      void handleImportFromUrl();
                    }
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder="https://brand.com/product-page"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  className="btn-off"
                  onClick={handleImportFromUrl}
                  disabled={isImportingUrl || !sourceUrl.trim()}
                  aria-label="Import nutrition from this link"
                >
                  {isImportingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isImportingUrl ? "Reading…" : "Import"}
                </Button>
              </div>
              <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                Paste a product page and we&apos;ll pull its nutrition. Kept on the food so you can resync it later.
              </span>
            </div>

            {/* SHARED-LIBRARY TOGGLE — a packaged product's nutrition is the same
                for everyone, so an imported one is worth adding once for all
                users rather than per-account. Defaults on for imports and off
                for hand-entered foods, which are usually personal. */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                style={{ accentColor: "var(--color-primary)", width: "1rem", height: "1rem", marginTop: "0.125rem", flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: "0.875rem" }}>Add to global database</span>
                <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Shared with every user instead of saved to just your library. Best for packaged products.
                </span>
              </span>
            </label>

          </div>
        )}

        {/* STEP 1 — SERVINGS + NUTRITION (merged into one slide). */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* SERVINGS SECTION */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* BASIS QUESTION */}
            <span className="text-page-title" style={{ fontSize: "1.25rem" }}>What will you be entering nutrition information for?</span>

            {/* BASIS TOGGLE — segmented Serving / 100 g / 100 ml. */}
            <div style={{ display: "flex", border: "1px solid var(--card-border)", overflow: "hidden" }}>
              {([
                { key: "serving", label: "Serving" },
                { key: "100g", label: "100 g" },
                { key: "100ml", label: "100 ml" },
              ] as const).map((opt, i) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setBasis(opt.key)}
                  aria-pressed={basis === opt.key}
                  style={{
                    flex: 1,
                    padding: "0.625rem 0.5rem",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid var(--card-border)",
                    background: basis === opt.key ? "var(--color-primary)" : "transparent",
                    color: basis === opt.key ? "var(--solid-background)" : "var(--color-primary)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* SERVING BASIS — explicit unit rows. */}
            {basis === "serving" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div className="flex flex-col gap-1">
                  <label className="text-label">Serving units</label>
                  <span className="text-muted" style={{ fontSize: "0.8125rem" }}>
                    How is this food measured? Add any units you log it by (grams, a can, a slice…). The nutrition you enter next is per one serving (the first unit).
                  </span>
                </div>

                {servings.length > 0 && (
                  <ServingTable
                    rows={servings}
                    onChange={updateServing}
                    onRemove={removeServing}
                    rowIdPrefix="ef-srv"
                    advanceOnEnter={(e) => {
                      // Serving-unit rows aren't a sequence to tab through, so
                      // Enter just closes the keyboard rather than advancing.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                  />
                )}
                <Button className="btn-off" onClick={addServing} style={{ alignSelf: "flex-start" }}>
                  <Plus className="w-4 h-4" /> Add unit
                </Button>
              </div>
            )}

            {/* 100g / 100ml BASIS — optional single portion. */}
            {basis !== "serving" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label className="text-label" style={{ fontSize: "1.0625rem" }}>Optionally define a single portion</label>

                {/* PORTION AMOUNT */}
                <div className="flex flex-col gap-1">
                  <label className="text-label" htmlFor="ef-portion-amount">{basis === "100ml" ? "Volume of Portion" : "Weight of Portion"}</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="ef-portion-amount"
                      className="input-field"
                      type="number"
                      inputMode="decimal"
                      value={portionAmount}
                      onChange={(e) => setPortionAmount(e.target.value)}
                      placeholder={basis === "100ml" ? "Enter portion volume" : "Enter portion weight"}
                      style={{ paddingRight: "2.5rem" }}
                    />
                    <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray)", fontSize: "0.8125rem", pointerEvents: "none" }}>
                      {basis === "100ml" ? "ml" : "g"}
                    </span>
                  </div>
                </div>

                {/* PORTION DESCRIPTION */}
                <div className="flex flex-col gap-1">
                  <label className="text-label">Portion Description</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      className="input-field"
                      type="number"
                      inputMode="numeric"
                      value={portionQty}
                      onChange={(e) => setPortionQty(e.target.value)}
                      placeholder="1"
                      style={{ width: "5rem", flex: "0 0 auto" }}
                    />
                    <input
                      className="input-field"
                      value={portionName}
                      onChange={(e) => setPortionName(e.target.value)}
                      placeholder="portion"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>
                  <span className="text-muted" style={{ fontSize: "0.8125rem" }}>
                    For example, if a single portion is {basis === "100ml" ? "1 bottle, enter 1 for quantity and bottle" : "4 pieces, enter 4 for quantity and pieces"} for portion name.
                  </span>
                </div>

                {/* INFO NOTE */}
                <div style={{ display: "flex", gap: "0.625rem", padding: "0.875rem", background: "var(--hover-bg)" }}>
                  <Info className="w-5 h-5 shrink-0" style={{ color: "var(--color-secondary)" }} />
                  <span className="text-muted" style={{ fontSize: "0.8125rem" }}>
                    All standard units of {basis === "100ml" ? "volume" : "weight"} will be available when you log this food.
                  </span>
                </div>
              </div>
            )}
            </div>

            {/* NUTRITION SECTION — calories + every nutrient, on the same slide as
                servings now that the two steps are merged. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} onKeyDown={nutritionEnterAdvance}>

            {/* SCAN LABEL — same tile style as the slide-1 scan row (dashed tile,
                green check once nutrition is captured). OCRs a Nutrition Facts
                photo to auto-fill the fields below; on desktop a clipboard image
                can also be pasted (see the paste-to-scan effect + hint below). */}
            <ScanTile
              icon={ScanText}
              label={isScanningLabel ? "Reading label…" : "Scan label"}
              filled={labelHasData}
              suspicious={labelLooksSuspect}
              busy={isScanningLabel}
              onClick={() => labelInputRef.current?.click()}
              fullWidth
            />

            {/* PASTE HINT — desktop only (mouse + keyboard), where Ctrl/⌘+V
                applies. Hidden on touch devices, which have no image paste. */}
            {isDesktop && (
              <span className="text-muted" style={{ fontSize: "0.75rem", textAlign: "center", marginTop: "-0.375rem" }}>
                or paste an image
              </span>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-label">Nutrition facts</label>
              <span className="text-muted" style={{ fontSize: "0.8125rem" }}>{basis === "serving" ? "Per serving." : basis === "100g" ? "Per 100 g." : "Per 100 ml."} Calories are required; everything else is optional.</span>
            </div>

            {/* MACRO BLOCK — FDA-label macros + their indented sub-rows, in label order. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <NutritionRow id="ef-kcal" label="Calories" unit="kcal" value={kcal} onChange={setKcal} bold dailyValue={MACRO_BY_KEY.kcal.dv} />
              <NutritionRow id="ef-fat" label="Total fat" unit="g" value={f} onChange={setF} bold dailyValue={MACRO_BY_KEY.fat.dv} />
              <NutritionRow id="ef-satfat" label="Saturated fat" unit={microUnit("sat_fat", "g")} value={readMicro("sat_fat")} onChange={(v) => writeMicro("sat_fat", v)} indent={1} dailyValue={microDV("sat_fat")} />
              <NutritionRow id="ef-transfat" label="Trans fat" unit={microUnit("trans_fat", "g")} value={readMicro("trans_fat")} onChange={(v) => writeMicro("trans_fat", v)} indent={1} dailyValue={microDV("trans_fat")} />
              <NutritionRow id="ef-chol" label="Cholesterol" unit={microUnit("cholesterol", "mg")} value={readMicro("cholesterol")} onChange={(v) => writeMicro("cholesterol", v)} dailyValue={microDV("cholesterol")} />
              <NutritionRow id="ef-sodium" label="Sodium" unit={microUnit("sodium", "mg")} value={readMicro("sodium")} onChange={(v) => writeMicro("sodium", v)} dailyValue={microDV("sodium")} />
              <NutritionRow id="ef-carbs" label="Total carbohydrate" unit="g" value={c} onChange={setC} bold dailyValue={MACRO_BY_KEY.carbs.dv} />
              <NutritionRow id="ef-fiber" label="Dietary fiber" unit={microUnit("fiber", "g")} value={readMicro("fiber")} onChange={(v) => writeMicro("fiber", v)} indent={1} dailyValue={microDV("fiber")} />
              <NutritionRow id="ef-sugar" label="Total sugars" unit={microUnit("sugar_total", "g")} value={readMicro("sugar_total")} onChange={(v) => writeMicro("sugar_total", v)} indent={1} dailyValue={microDV("sugar_total")} />
              <NutritionRow id="ef-added" label="Includes added sugars" unit={microUnit("sugar_added", "g")} value={readMicro("sugar_added")} onChange={(v) => writeMicro("sugar_added", v)} indent={2} dailyValue={microDV("sugar_added")} />
              <NutritionRow id="ef-protein" label="Protein" unit="g" value={p} onChange={setP} bold dailyValue={MACRO_BY_KEY.protein.dv} />

              {/* LABEL DIVIDER — the thick rule above the four required micros on a real label */}
              <div style={{ height: "1px", background: "var(--card-border)", margin: "0.375rem 0" }} />

              <NutritionRow id="ef-vitd" label="Vitamin D" unit={microUnit("vit_d", "mcg")} value={readMicro("vit_d")} onChange={(v) => writeMicro("vit_d", v)} dailyValue={microDV("vit_d")} />
              <NutritionRow id="ef-ca" label="Calcium" unit={microUnit("calcium", "mg")} value={readMicro("calcium")} onChange={(v) => writeMicro("calcium", v)} dailyValue={microDV("calcium")} />
              <NutritionRow id="ef-fe" label="Iron" unit={microUnit("iron", "mg")} value={readMicro("iron")} onChange={(v) => writeMicro("iron", v)} dailyValue={microDV("iron")} />
              <NutritionRow id="ef-k" label="Potassium" unit={microUnit("potassium", "mg")} value={readMicro("potassium")} onChange={(v) => writeMicro("potassium", v)} dailyValue={microDV("potassium")} />
            </div>

            {/* TAIL GROUPS — Vitamins / Minerals / Other, grouped + ordered by the FDA label scheme */}
            {fdaTailGroups.map((group) => (
              <Fragment key={group.heading}>
                <label className="text-label" style={{ marginTop: "0.5rem" }}>{group.heading}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {group.nutrients.map(renderNutrientRow)}
                </div>
              </Fragment>
            ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* BACK — floating bottom-left, only past the first step (the header X
          handles cancel, so there's no first-step Cancel). */}
      {step > 0 && (
        <Button
          className="btn-off"
          onClick={() => setStep((s) => s - 1)}
          disabled={isSaving}
          style={{ position: "fixed", left: "1rem", bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))", zIndex: 61, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
      )}

      {/* NEXT / CREATE — floating bottom-right. */}
      <Button
        className="btn-blue"
        onClick={handleNext}
        disabled={isSaving}
        style={{ position: "fixed", right: "1rem", bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))", zIndex: 61, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {isLastStep ? (isSaving ? "Creating…" : "Create food") : <>Next <ChevronRight className="w-4 h-4" /></>}
      </Button>

      {/* NUTRITION-LABEL FILE INPUT — single image of the Nutrition Facts panel,
          triggered by the "Scan nutrition label" button on the Nutrition slide.
          Mounted at the shell so it's reachable regardless of step. */}
      <input
        ref={labelInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleScanLabelFile(files);
        }}
      />

      {/* PRODUCT-FRONT FILE INPUT — single image of the package front, triggered
          by the "Scan front" tile on the Details slide. The LLM reads the brand
          and product name off it. */}
      <input
        ref={frontInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleScanLabelFile(files, "front");
        }}
      />

      {/* ICON PICKER MODAL */}
      {isPickingIcon && (
        <IconPickerModal
          selected={icon}
          onSelect={(code) => {
            setIcon(code);
            setIsPickingIcon(false);
          }}
          onClose={() => setIsPickingIcon(false)}
        />
      )}

      {/* LIVE BARCODE SCANNER */}
      {isLiveScannerOpen && (
        <LiveBarcodeScanner
          onDecode={(upc, symbology) => {
            setBarcodeUpc(upc);
            setIsLiveScannerOpen(false);
            toast.success(`Barcode read${symbology ? ` (${symbology})` : ""}`);
          }}
          onClose={() => setIsLiveScannerOpen(false)}
          onFallbackToUpload={() => barcodeInputRef.current?.click()}
        />
      )}
    </div>
  );
}

export function FoodForm({
  foodId,
  initialName,
  initialBarcode,
  onClose,
  onSaved,
  variant = "modal",
}: {
  // When set, the form loads + PUTs that food (edit mode). When null/undefined, POSTs a new food (create mode).
  foodId?: string | null;
  // Pre-fills the name field in create mode; ignored in edit mode.
  initialName?: string;
  // Pre-fills the UPC field in create mode (e.g. when arriving from a barcode scan
  // that didn't match anything in the user's library).
  initialBarcode?: string;
  onClose: () => void;
  onSaved: (food: Food) => void;
  // "modal" (default) wraps the form in a centered dialog — diary edit, create
  // food, barcode-miss. "page" renders it inline as an integrated full-page edit
  // mode on the food details page (no overlay; its own bottom action bar).
  variant?: "modal" | "page";
}) {
  const isEdit = !!foodId;

  // INPUT
  const [name, setName] = useState(initialName ?? "");
  const [brand, setBrand] = useState("");
  // UPC / barcode (no validation beyond trim — labels carry 8/12/13/14-digit codes).
  const [barcodeUpc, setBarcodeUpc] = useState(initialBarcode ?? "");
  // Source link — the product/nutrition page this food came from (foods.source_url).
  // Editable here, and what the details page's Resync action re-reads.
  const [sourceUrl, setSourceUrl] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [servings, setServings] = useState<ServingDraft[]>(isEdit ? [] : [{ unit: "g", ups: "" }]);
  // nutrientAmounts is keyed by nutrient.id. Empty string = "not entered" (won't be saved).
  const [nutrientAmounts, setNutrientAmounts] = useState<Record<string, string>>({});
  // Preseeded icon code from FOOD_ICONS. null = use the default (apple) — kept as
  // null in state (rather than coercing to "apple") so the DB column stays NULL
  // and a future default change applies retroactively to existing rows.
  const [icon, setIcon] = useState<string | null>(null);
  // Toggles the icon-picker modal stacked over the FoodModal.
  const [isPickingIcon, setIsPickingIcon] = useState(false);

  // DATA
  const nutrients = useNutrients();

  // STATE
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  // Toggles the live-camera scanner overlay for the UPC field.
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  // Source-link import (scrape the pasted URL) — its own in-flight flag so it
  // never shares a spinner with the photo pipelines.
  const [isImportingUrl, setIsImportingUrl] = useState(false);

  // Codes the merged macro/micro list renders inline (in label order, between
  // the macros). Everything else is rendered as the inline tail below the
  // required-four divider.
  const LABEL_ESSENTIAL_CODES = useMemo(() => new Set<string>(LEDGER_LABEL_ESSENTIAL_CODES), []);

  // Code → Nutrient lookup so the macro/micro merged list can resolve label
  // metadata (id, unit) for each inline row without scanning the array repeatedly.
  const nutrientByCode = useMemo(() => {
    const map = new Map<string, Nutrient>();
    for (const n of nutrients) map.set(n.code, n);
    return map;
  }, [nutrients]);

  // Remaining nutrients rendered after the four required micros — extra
  // vitamins (A, C, E, K, B-complex, choline) then trace minerals.
  const tailNutrients = useMemo(
    () =>
      nutrients
        // drop the four required micros (rendered above) AND the macros, which
        // have their own dedicated rows — otherwise calories/fat/carbs/protein
        // duplicate into the tail and land out of place in the manifest.
        .filter((n) => !LABEL_ESSENTIAL_CODES.has(n.code) && n.category !== "macro")
        .sort(byNutrientOrder), // canonical manifest order (vitamins → minerals → other), not DB display_order
    [nutrients, LABEL_ESSENTIAL_CODES]
  );

  // ENTER-TO-ADVANCE — ordered list of input ids in visual order, used to move
  // focus to the next field when Enter is pressed (mirrors golem SetTab's
  // handleEnterAdvance). Rebuilt from state because the serving rows and the
  // nutrient tail are variable-length. The serving unit <select> and the kcal
  // %DV toggle are intentionally skipped — only text/number inputs participate.
  const advanceOrder = useMemo(() => {
    const ids = ["ef-name", "ef-brand", "ef-upc", "ef-source-url"];
    servings.forEach((_, i) => ids.push(`ef-srv-${i}-ups`));
    ids.push(
      "ef-kcal", "ef-fat", "ef-satfat", "ef-transfat", "ef-chol", "ef-sodium",
      "ef-carbs", "ef-fiber", "ef-sugar", "ef-added", "ef-protein",
      "ef-vitd", "ef-ca", "ef-fe", "ef-k"
    );
    tailNutrients.forEach((n) => ids.push(`ef-nut-${n.id}`));
    return ids;
  }, [servings, tailNutrients]);

  // Attached once on the form container so every descendant <input> participates
  // without per-field wiring. Focuses (and selects) the next field in
  // advanceOrder; blurs on the last field to close the mobile keyboard.
  function advanceOnEnter(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    // Only intercept Enter from real text/number inputs — leave buttons, the
    // unit dropdown, and the hidden file inputs (label/barcode scan) untouched.
    if (target.tagName !== "INPUT" || (target as HTMLInputElement).type === "file") return;
    e.preventDefault();
    const idx = advanceOrder.indexOf(target.id);
    const nextId = idx >= 0 && idx < advanceOrder.length - 1 ? advanceOrder[idx + 1] : null;
    if (nextId) {
      const next = document.getElementById(nextId) as HTMLInputElement | null;
      next?.focus();
      next?.select?.();
    } else {
      (target as HTMLInputElement).blur();
    }
  }

  function readMicro(code: string): string {
    const n = nutrientByCode.get(code);
    if (!n) return "";
    return nutrientAmounts[n.id] ?? "";
  }

  function writeMicro(code: string, value: string) {
    const n = nutrientByCode.get(code);
    if (!n) return;
    setNutrientAmounts((prev) => {
      const next = { ...prev };
      // Empty string = "not entered" (omit row). An explicit "0" is meaningful
      // ("0g trans fat" on a real label) and must round-trip — keep it.
      if (value === "") delete next[n.id];
      else next[n.id] = value;
      return next;
    });
  }

  function microUnit(code: string, fallback: string): string {
    return nutrientByCode.get(code)?.unit ?? fallback;
  }

  // Returns the FDA Daily Value for a nutrient code, or null if no DV is published.
  // Drives the "tap unit to enter as %DV" toggle on NutritionRow — without a DV,
  // there's nothing to back-calculate against and the toggle is suppressed.
  function microDV(code: string): number | null {
    return nutrientByCode.get(code)?.daily_value ?? null;
  }

  // APPLY DRAFT — shared by both auto-fill sources (the label photo scan and the
  // source-link import), which hand back the same LabelOcrDraft shape. A numeric
  // value (including 0) came from the source — write it in. `null` means the
  // field wasn't there at all, so leave whatever the user already typed (or the
  // empty/dash-placeholder state) untouched. The server has already dropped any
  // nutrition that didn't come from a real facts panel.
  function applyFoodDraft(draft: LabelOcrDraft) {
    if (draft.name) setName(draft.name);
    if (draft.brand) setBrand(draft.brand);
    // Icon the model picked for this product (e.g. "cup-soda").
    if (draft.icon) setIcon(draft.icon);
    // UPC read off the barcode (front or back of the package) — zbar-decoded
    // server-side with the vision LLM's printed-digit read as a fallback.
    if (draft.barcode_upc) setBarcodeUpc(draft.barcode_upc);
    if (draft.kcal_per_serving !== null) setKcal(String(draft.kcal_per_serving));
    if (draft.protein_g_per_serving !== null) setP(String(draft.protein_g_per_serving));
    if (draft.carbs_g_per_serving !== null) setC(String(draft.carbs_g_per_serving));
    if (draft.fat_g_per_serving !== null) setF(String(draft.fat_g_per_serving));
    // Replace serving rows from the draft. Filter to positive quantities; an empty
    // result leaves the existing rows untouched.
    const draftServings = draft.servings
      .filter((s) => Number.isFinite(s.units_per_serving) && s.units_per_serving > 0 && s.unit)
      .map((s) => ({ unit: s.unit, ups: String(s.units_per_serving) }));
    if (draftServings.length > 0) {
      setServings(draftServings);
    }
    if (Object.keys(draft.nutrients_by_code).length > 0) {
      const byId: Record<string, string> = {};
      for (const n of nutrients) {
        const amt = draft.nutrients_by_code[n.code];
        // >= 0 so that explicit zeros from the label ("Trans Fat 0g") propagate to
        // the editor as "0" rather than being dropped.
        if (typeof amt === "number" && amt >= 0) byId[n.id] = String(amt);
      }
      setNutrientAmounts(byId);
    }
  }

  // IMPORT FROM SOURCE LINK — scrapes the product/nutrition page in the source
  // field and refills the form from it. Same endpoint the create wizard and the
  // details page's Resync use, so all three read a page identically.
  async function handleImportFromUrl() {
    const url = sourceUrl.trim();
    if (!url || isImportingUrl) return;
    setIsImportingUrl(true);
    const toastId = toast.loading("Reading page…");
    try {
      const res = await fetch(`/modules/forage/api/foods/import-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const draft = await res.json();
      if (!res.ok) {
        toast.error(draft?.error || "Couldn't read that link", { id: toastId });
        return;
      }
      applyFoodDraft(draft as LabelOcrDraft);
      if (draft.serving_size_stated) toast.success(importedFromMessage(draft), { id: toastId });
      else toast.error("No nutrition found on that page", { id: toastId });
    } catch {
      toast.error("Couldn't read that link", { id: toastId });
    } finally {
      setIsImportingUrl(false);
    }
  }

  // Accepts one OR MORE images — pick the package front + back together and the
  // vision LLM reads the brand/name off the front while still reading nutrition
  // off the facts panel.
  async function handleScanFile(fileOrFiles: File | File[]) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    if (files.length === 0) return;
    setIsScanning(true);
    const toastId = toast.loading("Scanning…");
    try {
      const form = new FormData();
      for (const file of files) form.append("image", file);
      const res = await fetch(`/modules/forage/api/label-ocr`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Couldn't read the photo", { id: toastId });
        return;
      }
      const draft: LabelOcrDraft = await res.json();
      applyFoodDraft(draft);
      const captured = !!draft.name || !!draft.brand || !!draft.barcode_upc || draft.serving_size_stated;
      if (captured) toast.success("Scanned", { id: toastId });
      else toast.error("Nothing found — try a clearer photo", { id: toastId });
    } catch {
      toast.error("Couldn't read the photo", { id: toastId });
    } finally {
      setIsScanning(false);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  }

  // Scan a photo of just the package barcode (UPC/EAN). Reuses the same upload
  // pattern as the nutrition-label scan, but routes through zbarimg on the server
  // and only sets the barcode field — everything else on the form is left alone.
  async function handleScanBarcodeFile(file: File) {
    setIsScanningBarcode(true);
    const toastId = toast.loading("Reading barcode…");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/modules/forage/api/barcode-scan`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to read barcode", { id: toastId });
        return;
      }
      const draft: { barcode_upc: string | null; symbology: string | null } = await res.json();
      if (!draft.barcode_upc) {
        toast.error("No barcode detected — try a clearer photo", { id: toastId });
        return;
      }
      setBarcodeUpc(draft.barcode_upc);
      toast.success(`Barcode read${draft.symbology ? ` (${draft.symbology})` : ""}`, { id: toastId });
    } catch {
      toast.error("Failed to read barcode", { id: toastId });
    } finally {
      setIsScanningBarcode(false);
      if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    }
  }

  // PASTE-IMAGE — desktop convenience. While the create-mode modal is open, listen
  // for clipboard paste events; if any item is an image, hand it off to the same
  // OCR flow the file picker uses. Skipped during an in-flight scan so a fast
  // double-paste doesn't queue a second request.
  useEffect(() => {
    if (isEdit) return;
    function onPaste(e: ClipboardEvent) {
      if (isScanning) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleScanFile(file);
            return;
          }
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isScanning, nutrients]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setIsLoading(true);
    fetch(`/modules/forage/api/foods/${foodId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Food) => {
        if (cancelled) return;
        setName(data.name ?? "");
        setBrand(data.brand ?? "");
        setBarcodeUpc(data.barcode_upc ?? "");
        setSourceUrl(data.source_url ?? "");
        setKcal(String(data.kcal_per_serving ?? ""));
        setP(String(data.protein_g_per_serving ?? ""));
        setC(String(data.carbs_g_per_serving ?? ""));
        setF(String(data.fat_g_per_serving ?? ""));
        setServings(
          (data.servings ?? [])
            // The canonical {serving, 1} row is implicit — hide it from the editor.
            .filter((s) => s.unit !== "serving")
            .map((s) => ({
              unit: s.unit,
              ups: String(s.units_per_serving ?? ""),
            }))
        );
        const loaded: Record<string, string> = {};
        for (const n of data.nutrients ?? []) loaded[n.nutrient_id] = String(n.amount);
        setNutrientAmounts(loaded);
        setIcon(data.icon ?? null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load food");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [foodId, isEdit]);

  function addServing() {
    setServings((prev) => [...prev, { unit: "g", ups: "" }]);
  }
  function updateServing(i: number, patch: Partial<ServingDraft>) {
    setServings((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeServing(i: number) {
    setServings((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    if (!kcal) {
      toast.error("kcal required");
      return;
    }
    setIsSaving(true);
    try {
      const url = isEdit ? `/modules/forage/api/foods/${foodId}` : `/modules/forage/api/foods`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          barcode_upc: barcodeUpc.trim() || null,
          source_url: sourceUrl.trim() || null,
          kcal_per_serving: Number(kcal),
          protein_g_per_serving: Number(p || 0),
          carbs_g_per_serving: Number(c || 0),
          fat_g_per_serving: Number(f || 0),
          icon,
          servings: servings
            .map((s) => ({ unit: (s.unit ?? "").trim(), units_per_serving: Number(s.ups) }))
            .filter((s) => s.unit && Number.isFinite(s.units_per_serving) && s.units_per_serving > 0),
          nutrients: Object.entries(nutrientAmounts)
            .map(([nutrient_id, amount]) => ({ nutrient_id, amount: Number(amount) }))
            .filter((n) => Number.isFinite(n.amount) && n.amount >= 0),
        }),
      });
      if (!res.ok) {
        toast.error(isEdit ? "Failed to update food" : "Failed to create food");
        return;
      }
      const saved: Food = await res.json();
      toast.success(isEdit ? "Food updated" : "Food created");
      onSaved(saved);
    } catch {
      toast.error(isEdit ? "Failed to update food" : "Failed to create food");
    } finally {
      setIsSaving(false);
    }
  }

  // ACTION BUTTONS — Cancel + Save/Create. Rendered in the modal footer (modal
  // variant) or the inline action bar (page variant).
  const actions = (
    <>
      <Button className="btn-link" onClick={onClose} disabled={isSaving}>Cancel</Button>
      <Button className="btn-green" onClick={handleSave} disabled={isSaving || isLoading}>
        {isSaving ? "Saving..." : isEdit ? "Save changes" : "Create food"}
      </Button>
    </>
  );

  // SHARED FORM BODY — identical between the modal and the integrated page
  // variant; only the surrounding chrome (overlay + footer vs. inline action
  // bar) differs.
  const body = isLoading ? (
        <div className="loading-container"><div className="loading-spinner" /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} onKeyDown={advanceOnEnter}>
          {/* SCAN LABEL — create mode only. */}
          {!isEdit && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button className="btn-off" onClick={() => scanInputRef.current?.click()} disabled={isScanning}>
                  <Camera className="w-4 h-4" />
                  {isScanning ? "Reading label…" : "Scan nutrition label"}
                </Button>
                <span className="text-muted" style={{ fontSize: "0.75rem" }}>front &amp; back for a sharper brand, or paste an image</span>
              </div>
              {/* `multiple` lets the user pick the package front + back together. */}
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) handleScanFile(files);
                }}
              />
            </>
          )}

          {/* NAME */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="ef-name">Food name</label>
            <input
              id="ef-name"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCapitalize="words"
              autoFocus={!isEdit}
            />
          </div>

          {/* BRAND */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="ef-brand">Brand (optional)</label>
            <input
              id="ef-brand"
              className="input-field"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              autoCapitalize="words"
            />
          </div>

          {/* UPC / BARCODE */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="ef-upc">UPC / barcode (optional)</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
              <input
                id="ef-upc"
                className="input-field"
                value={barcodeUpc}
                onChange={(e) => setBarcodeUpc(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 012345678905"
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button
                className="btn-off"
                onClick={() => setIsLiveScannerOpen(true)}
                disabled={isScanningBarcode}
                aria-label="Scan barcode with camera"
              >
                <Camera className="w-4 h-4" />
                {isScanningBarcode ? "Reading…" : "Scan"}
              </Button>
              <input
                ref={barcodeInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanBarcodeFile(file);
                }}
              />
            </div>
          </div>

          {/* SOURCE LINK — product / nutrition page this food comes from. Saved on
              the food; "Import" re-reads the page and refills the form from it
              (the details page's Resync uses the same link). */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="ef-source-url">Source link (optional)</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
              <input
                id="ef-source-url"
                className="input-field"
                type="url"
                inputMode="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                placeholder="https://brand.com/product-page"
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button
                className="btn-off"
                onClick={handleImportFromUrl}
                disabled={isImportingUrl || !sourceUrl.trim()}
                aria-label="Import nutrition from this link"
              >
                {isImportingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isImportingUrl ? "Reading…" : "Import"}
              </Button>
            </div>
          </div>

          {/* ICON */}
          <div className="flex flex-col gap-1">
            <label className="text-label">Icon</label>
            <Button className="btn-off" onClick={() => setIsPickingIcon(true)} style={{ alignSelf: "flex-start" }}>
              {(() => {
                const CurrentIcon = resolveFoodIcon(icon);
                return <CurrentIcon size={18} />;
              })()}
              Change icon
            </Button>
          </div>

          {/* SERVINGS */}
          {servings.length > 0 && (
            <ServingTable
              rows={servings}
              onChange={updateServing}
              onRemove={removeServing}
              rowIdPrefix="ef-srv"
            />
          )}
          <Button className="btn-off" onClick={addServing} style={{ alignSelf: "flex-start" }}>
            <Plus className="w-4 h-4" /> Add unit
          </Button>

              {/* PER-SERVING NUTRITION FACTS — macros and micros merged into one
                  label-order list. Reads top-to-bottom like a real FDA Nutrition
                  Facts panel: sat fat indented under total fat, fiber/sugars
                  indented under carbs, etc. The four FDA-required vitamins/minerals
                  (D, Ca, Fe, K) are visible inline; the rest are tucked behind the
                  "More vitamins & minerals" toggle. */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <NutritionRow id="ef-kcal" label="Calories" unit="kcal" value={kcal} onChange={setKcal} bold dailyValue={MACRO_BY_KEY.kcal.dv} />
                <NutritionRow id="ef-fat" label="Total fat" unit="g" value={f} onChange={setF} bold dailyValue={MACRO_BY_KEY.fat.dv} />
                <NutritionRow id="ef-satfat" label="Saturated fat" unit={microUnit("sat_fat", "g")} value={readMicro("sat_fat")} onChange={(v) => writeMicro("sat_fat", v)} indent={1} dailyValue={microDV("sat_fat")} />
                <NutritionRow id="ef-transfat" label="Trans fat" unit={microUnit("trans_fat", "g")} value={readMicro("trans_fat")} onChange={(v) => writeMicro("trans_fat", v)} indent={1} dailyValue={microDV("trans_fat")} />
                <NutritionRow id="ef-chol" label="Cholesterol" unit={microUnit("cholesterol", "mg")} value={readMicro("cholesterol")} onChange={(v) => writeMicro("cholesterol", v)} dailyValue={microDV("cholesterol")} />
                <NutritionRow id="ef-sodium" label="Sodium" unit={microUnit("sodium", "mg")} value={readMicro("sodium")} onChange={(v) => writeMicro("sodium", v)} dailyValue={microDV("sodium")} />
                <NutritionRow id="ef-carbs" label="Total carbohydrate" unit="g" value={c} onChange={setC} bold dailyValue={MACRO_BY_KEY.carbs.dv} />
                <NutritionRow id="ef-fiber" label="Dietary fiber" unit={microUnit("fiber", "g")} value={readMicro("fiber")} onChange={(v) => writeMicro("fiber", v)} indent={1} dailyValue={microDV("fiber")} />
                <NutritionRow id="ef-sugar" label="Total sugars" unit={microUnit("sugar_total", "g")} value={readMicro("sugar_total")} onChange={(v) => writeMicro("sugar_total", v)} indent={1} dailyValue={microDV("sugar_total")} />
                <NutritionRow id="ef-added" label="Includes added sugars" unit={microUnit("sugar_added", "g")} value={readMicro("sugar_added")} onChange={(v) => writeMicro("sugar_added", v)} indent={2} dailyValue={microDV("sugar_added")} />
                <NutritionRow id="ef-protein" label="Protein" unit="g" value={p} onChange={setP} bold dailyValue={MACRO_BY_KEY.protein.dv} />

                {/* LABEL DIVIDER — same role as the thick rule above vitamins on a real label */}
                <div style={{ height: "1px", background: "var(--card-border)", margin: "0.375rem 0" }} />

                <NutritionRow id="ef-vitd" label="Vitamin D" unit={microUnit("vit_d", "mcg")} value={readMicro("vit_d")} onChange={(v) => writeMicro("vit_d", v)} dailyValue={microDV("vit_d")} />
                <NutritionRow id="ef-ca" label="Calcium" unit={microUnit("calcium", "mg")} value={readMicro("calcium")} onChange={(v) => writeMicro("calcium", v)} dailyValue={microDV("calcium")} />
                <NutritionRow id="ef-fe" label="Iron" unit={microUnit("iron", "mg")} value={readMicro("iron")} onChange={(v) => writeMicro("iron", v)} dailyValue={microDV("iron")} />
                <NutritionRow id="ef-k" label="Potassium" unit={microUnit("potassium", "mg")} value={readMicro("potassium")} onChange={(v) => writeMicro("potassium", v)} dailyValue={microDV("potassium")} />

                {/* TAIL — remaining vitamins (A, C, E, K, B-complex, choline) then
                    remaining minerals (Mg, P, Zn, Cu, Mn, Se, I, Cr, Mo, Cl). All
                    visible inline in display_order. */}
                {tailNutrients.map((n) => (
                  <NutritionRow
                    key={n.id}
                    id={`ef-nut-${n.id}`}
                    label={n.name}
                    unit={n.unit}
                    dailyValue={n.daily_value}
                    value={nutrientAmounts[n.id] ?? ""}
                    onChange={(v) => {
                      setNutrientAmounts((prev) => {
                        const next = { ...prev };
                        if (v === "") delete next[n.id];
                        else next[n.id] = v;
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            </div>
  );

  // STACKED OVERLAYS — icon picker + live barcode scanner. Each is its own
  // modal, so it works the same whether the form is in a dialog or inline.
  const overlays = (
    <>
      {/* ICON PICKER MODAL */}
      {isPickingIcon && (
        <IconPickerModal
          selected={icon}
          onSelect={(code) => {
            setIcon(code);
            setIsPickingIcon(false);
          }}
          onClose={() => setIsPickingIcon(false)}
        />
      )}

      {/* LIVE BARCODE SCANNER */}
      {isLiveScannerOpen && (
        <LiveBarcodeScanner
          onDecode={(upc, symbology) => {
            setBarcodeUpc(upc);
            setIsLiveScannerOpen(false);
            toast.success(`Barcode read${symbology ? ` (${symbology})` : ""}`);
          }}
          onClose={() => setIsLiveScannerOpen(false)}
          onFallbackToUpload={() => barcodeInputRef.current?.click()}
        />
      )}
    </>
  );

  // INTEGRATED PAGE VARIANT — inline full-page edit mode (food details page):
  // no overlay; the form sits in the page flow with its own bottom action bar.
  if (variant === "page") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {body}

        {/* ACTION BAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          {actions}
        </div>

        {overlays}
      </div>
    );
  }

  // MODAL VARIANT — centered dialog (default): diary edit, create food, barcode-miss.
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? "Edit food" : "New food"}
      fullHeight
      disableClose={isSaving}
      footer={actions}
    >
      {body}
      {overlays}
    </Modal>
  );
}

// Thin wrapper preserving the existing modal call sites (diary timeline edit,
// create-food, barcode-miss). The food details page uses <FoodForm variant="page" />.
export function FoodModal(props: {
  foodId?: string | null;
  initialName?: string;
  initialBarcode?: string;
  onClose: () => void;
  onSaved: (food: Food) => void;
}) {
  return <FoodForm {...props} variant="modal" />;
}

/* ============================================================
   ICON PICKER MODAL — grid of preseeded FOOD_ICONS, stacked on top of FoodModal.
   ============================================================ */

export function IconPickerModal({
  selected,
  onSelect,
  onClose,
}: {
  selected: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal isOpen onClose={onClose} title="Choose icon" zIndex={60}>
      {/* ICON GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(3rem, 1fr))",
          gap: "0.5rem",
        }}
      >
        {FOOD_ICONS.map((opt) => {
          const isSelected = selected === opt.code;
          const OptIcon = opt.Icon;
          return (
            /* ICON OPTION */
            <button
              key={opt.code}
              type="button"
              onClick={() => onSelect(opt.code)}
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={isSelected}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.25rem",
                aspectRatio: "1 / 1",
                borderRadius: "0.5rem",
                border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--card-border)",
                background: isSelected ? "var(--btn-blue-bg)" : "var(--card-bg)",
                color: "var(--color-primary)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <OptIcon size={20} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ============================================================
   FOOD DETAIL — shared content + full-screen modal
   ============================================================
   FoodDetailContent renders a food's read-only identity, macro tiles,
   serving sizes and nutrient breakdown. It is the single source of truth
   for the library detail page (the full route a diary entry's "View food"
   menu action navigates to). */

/* ============================================================
   RECIPE USAGE — "Used in recipes" section. A food (including a recipe,
   which is itself a food) can be an ingredient in other recipes; this
   lists those parent recipes and links to each. Shared by the food detail
   page, the diary detail modal, the food-logger sheet, and the recipe
   editor so the surface is identical everywhere a food/recipe is viewed.
   Renders nothing when the food isn't used in any recipe.
   ============================================================ */

export function RecipeUsageList({ foodId }: { foodId: string }) {
  const router = useRouter();

  // DATA — parent recipes that include this food as an ingredient. Best-effort:
  // a failed/empty fetch just leaves the section hidden.
  const [recipes, setRecipes] = useState<{ id: string; name: string; brand: string | null; icon: string | null }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/modules/forage/api/foods/${foodId}/recipes`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (alive && Array.isArray(data)) setRecipes(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [foodId]);

  if (recipes.length === 0) return null;

  return (
    /* USED IN RECIPES CARD */
    <div className="card" style={{ marginBottom: "1.25rem" }}>

      {/* HEADER */}
      <div className="card-header">
        <h3 className="text-card-title">Used in recipes</h3>
      </div>

      {/* RECIPE LIST */}
      <div className="card-content" style={{ padding: 0 }}>
        {recipes.map((parent, index) => {
          const ParentIcon = resolveFoodIcon(parent.icon);
          return (
            /* RECIPE ROW — navigates to the parent recipe detail page */
            <button
              key={parent.id}
              className="sub-card"
              onClick={() => router.push(`/modules/forage/ui/recipes/${parent.id}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderBottom: index < recipes.length - 1 ? "1px solid var(--color-border)" : "none",
                borderRadius: 0,
              }}
            >

              {/* ICON */}
              <ParentIcon className="w-6 h-6" style={{ flexShrink: 0 }} />

              {/* NAME + BRAND */}
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* NAME */}
                <div className="text-primary" style={{ fontWeight: 600, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {parent.name}
                </div>

                {/* BRAND */}
                {parent.brand && (
                  <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {parent.brand}
                  </div>
                )}
              </div>

              {/* CHEVRON */}
              <ChevronRight className="w-4 h-4 text-muted" style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// RECIPE INGREDIENTS — read-only list shown when viewing a recipe-source food
// (e.g. the diary timeline's "View food" on a logged recipe). The ingredients
// arrive preloaded on the food payload, so this paints with the rest of the
// detail — same read-only rows as the recipe detail page.
function RecipeIngredientsView({ ingredients }: { ingredients: RecipeIngredient[] }) {
  const router = useRouter();

  // Hide the whole section when the recipe has no ingredients — an empty
  // "Ingredients · 0" block on a normal-looking food reads as broken.
  if (ingredients.length === 0) return null;

  return (
    /* INGREDIENTS SECTION */
    <div style={{ marginTop: "1.25rem" }}>

      {/* HEADING */}
      <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
        Ingredients · {ingredients.length}
      </div>

      {/* LIST */}
      <div className="flex flex-col gap-2">
        {ingredients.map((row) => {
          const RowIcon = resolveFoodIcon(row.food_icon ?? null);

          // Placeholder rows (unresolved URL/AI imports) have no backing food, so
          // there's nowhere to navigate — render them inert with their free text.
          const navigable = !!row.ingredient_food_id;
          return (
            /* INGREDIENT ROW — tap to open the ingredient food's detail page */
            <button
              key={row.id}
              type="button"
              className="sub-card fg-ing fg-ing-row"
              onClick={navigable ? () => router.push(`/modules/forage/ui/library/${row.ingredient_food_id}`) : undefined}
              disabled={!navigable}
              aria-label={navigable ? `Open ${row.food_name ?? "ingredient"} details` : undefined}
            >

              {/* ICON */}
              <RowIcon className="fg-ing-icon" />

              {/* BODY — name/brand stacked above the derived macros */}
              <div className="fg-ing-titles">

                {/* FOOD NAME — resolved rows show the library name; placeholders fall back to free text */}
                <div className="fg-ing-name">{row.food_name ?? row.placeholder_name}</div>

                {/* BRAND */}
                {row.food_brand && (
                  <div className="fg-ing-brand">{row.food_brand}</div>
                )}

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
              </div>

              {/* TRAILING — amount/unit summary + chevron affordance */}
              <div className="fg-ing-trail">

                {/* QTY / UNIT — resolved rows show amount+unit; placeholders show their free-text quantity */}
                <span className="fg-ing-qty-view">
                  {navigable
                    ? `${Math.round((row.quantity ?? 0) * 1000) / 1000} ${row.serving_unit ?? ""}`
                    : row.placeholder_quantity_text ?? ""}
                </span>

                {/* CHEVRON — only when the row opens a detail page */}
                {navigable && <ChevronRight className="fg-ing-chev" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   FOOD USAGE — "Usage" card. Shows how often this food has been logged:
   all-time headline counts (times logged, distinct days, last logged) plus a
   trailing 12-week frequency bar chart. Best-effort: a failed/empty fetch just
   leaves the headline at zero with an empty-state line. Shared by the food
   detail page and the diary detail modal so the surface is identical wherever a
   food is viewed.
   ============================================================ */

// Human-readable "last logged" relative to today (YYYY-MM-DD in, e.g. "today",
// "yesterday", "3 days ago", "2 weeks ago"). Returns null for a missing date.
function formatLastLogged(iso: string | null): string | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${iso}T00:00:00`);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function FoodUsageCard({ foodId }: { foodId: string }) {
  // DATA — logging-frequency stats. Best-effort: a failed fetch leaves it null
  // and the card hides itself entirely (no usage row on a brand-new food import).
  const [usage, setUsage] = useState<FoodUsageStats | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    fetch(`/modules/forage/api/foods/${foodId}/usage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FoodUsageStats | null) => {
        if (alive && data && Array.isArray(data.weekly)) setUsage(data);
      })
      .catch(() => {})
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [foodId]);

  // Peak weekly count sets the chart's full-height reference; guard the 0 case so
  // an all-empty series renders flat baselines instead of NaN heights.
  const maxWeek = useMemo(
    () => (usage ? Math.max(1, ...usage.weekly.map((w) => w.count)) : 1),
    [usage]
  );

  // Hide the whole card while loading or when the fetch failed — a phantom
  // "Usage · 0" block on a food that simply hasn't loaded reads as broken.
  if (isLoading || !usage) return null;

  const lastLogged = formatLastLogged(usage.last_logged);
  const neverLogged = usage.total_entries === 0;

  return (
    /* USAGE CARD */
    <div className="card" style={{ marginTop: "1.25rem" }}>

      {/* HEADER */}
      <div className="card-header">
        <h3 className="text-card-title">Usage</h3>
      </div>

      {/* CARD CONTENT */}
      <div className="card-content">

        {neverLogged ? (
          /* EMPTY STATE — food exists in the library but was never logged */
          <div className="text-muted" style={{ fontSize: "0.875rem" }}>
            You haven&apos;t logged this food yet.
          </div>
        ) : (
          <>

            {/* HEADLINE STATS — times logged / distinct days / last logged */}
            <div className="fg-usage-stats">

              {/* TIMES LOGGED */}
              <div className="fg-usage-stat">
                <div className="fg-usage-stat-value">{usage.total_entries}</div>
                <div className="fg-usage-stat-label">{usage.total_entries === 1 ? "time logged" : "times logged"}</div>
              </div>

              {/* DISTINCT DAYS */}
              <div className="fg-usage-stat">
                <div className="fg-usage-stat-value">{usage.distinct_days}</div>
                <div className="fg-usage-stat-label">{usage.distinct_days === 1 ? "day" : "days"}</div>
              </div>

              {/* LAST LOGGED */}
              <div className="fg-usage-stat">
                <div className="fg-usage-stat-value" style={{ fontSize: "1rem" }}>{lastLogged ?? "—"}</div>
                <div className="fg-usage-stat-label">last logged</div>
              </div>
            </div>

            {/* FREQUENCY CHART — one bar per trailing week (oldest → newest) */}
            <div className="fg-usage-chart-wrap">

              {/* CHART HEADING */}
              <div className="section-heading" style={{ paddingLeft: 0 }}>
                Last 12 weeks
              </div>

              {/* BARS */}
              <div className="fg-usage-chart" role="img" aria-label="Weekly logging frequency over the last 12 weeks">
                {usage.weekly.map((week) => {
                  const pct = Math.round((week.count / maxWeek) * 100);
                  return (
                    /* WEEK BAR — height ∝ that week's log count; title shows exact count */
                    <div
                      key={week.week_start}
                      className="fg-usage-bar-track"
                      title={`Week of ${week.week_start}: ${week.count} ${week.count === 1 ? "log" : "logs"}`}
                    >
                      {/* FILL */}
                      <div
                        className="fg-usage-bar-fill"
                        data-empty={week.count === 0 ? "true" : undefined}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Host of a stored source link, for a compact one-line display ("tacobell.com").
// Falls back to the raw string if it somehow isn't parseable — the column holds
// whatever was saved, and a malformed link should still be visible/fixable.
export function sourceUrlHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function FoodDetailContent({
  food,
  nutrients,
  onToggleFavorite,
  isFaving,
}: {
  // Recipe-source foods arrive with their ingredients attached (see
  // FoodWithIngredients); every other source is a plain Food.
  food: FoodWithIngredients;
  nutrients: Nutrient[];
  onToggleFavorite?: () => void;
  isFaving?: boolean;
}) {
  // DATA
  const foodNutrients = food.nutrients ?? [];

  // Macro distribution percentages (energy share of each macro).
  const macroDist = useMemo(() => {
    const pKcal = food.protein_g_per_serving * 4;
    const fKcal = food.fat_g_per_serving * 9;
    const cKcal = food.carbs_g_per_serving * 4;
    const total = pKcal + fKcal + cKcal;
    return {
      pPct: total > 0 ? Math.round((pKcal / total) * 100) : 0,
      fPct: total > 0 ? Math.round((fKcal / total) * 100) : 0,
      cPct: total > 0 ? Math.round((cKcal / total) * 100) : 0,
    };
  }, [food]);

  return (
    <>
      {/* FOOD IDENTITY CARD */}
      <div className="sub-card" style={{ padding: "1rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>

        {/* PHOTO / ICON */}
        <FoodAvatar food={food} size={32} variant="inline" />

        {/* NAME / BRAND / SOURCE */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-primary" style={{ fontWeight: 600, fontSize: "1rem" }}>{food.name}</div>
          {food.brand && <div className="text-muted" style={{ fontSize: "0.8125rem" }}>{food.brand}</div>}
          <div className="text-muted" style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>{food.source}</div>

          {/* SOURCE LINK — the page this food's nutrition came from. Opens in a new
              tab; the host alone is shown so a long URL can't run out of the card
              (the full link is the title/aria text). */}
          {food.source_url && (
            <a
              className="text-muted"
              href={food.source_url}
              target="_blank"
              rel="noopener noreferrer"
              title={food.source_url}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.75rem",
                textDecoration: "underline",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <ExternalLink className="w-3 h-3" style={{ flexShrink: 0 }} />
              {sourceUrlHost(food.source_url)}
            </a>
          )}
        </div>

        {/* FAVORITE */}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={isFaving}
            aria-label={food.is_favorite ? "Remove from favorites" : "Add to favorites"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem",
              color: food.is_favorite ? "var(--fg-cal)" : "var(--color-gray)",
            }}
          >
            <Heart className="w-5 h-5" style={{ fill: food.is_favorite ? "currentColor" : "none" }} />
          </button>
        )}
      </div>

      {/* MACRO TILES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {[
          { label: "Calories", value: Math.round(food.kcal_per_serving).toString(), pct: null as number | null, color: "var(--fg-cal)" },
          { label: "Protein", value: (Math.round(food.protein_g_per_serving * 10) / 10).toFixed(1), pct: macroDist.pPct, color: "var(--fg-protein)" },
          { label: "Fat", value: (Math.round(food.fat_g_per_serving * 10) / 10).toFixed(1), pct: macroDist.fPct, color: "var(--fg-fat)" },
          { label: "Carbs", value: (Math.round(food.carbs_g_per_serving * 10) / 10).toFixed(1), pct: macroDist.cPct, color: "var(--fg-carb)" },
        ].map((tile) => (

          /* MACRO TILE */
          <div key={tile.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>

            {/* DISTRIBUTION CHIP */}
            {tile.pct != null && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.125rem 0.5rem",
                  borderRadius: "999px",
                  background: `color-mix(in srgb, ${tile.color} 30%, transparent)`,
                  color: tile.color,
                }}
              >
                {tile.pct}%
              </span>
            )}

            {/* VALUE */}
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)" }}>
              {tile.value}
            </div>

            {/* LABEL */}
            <div style={{ fontSize: "0.75rem", color: "var(--color-secondary)" }}>{tile.label}</div>
          </div>
        ))}
      </div>

      {/* SERVINGS SECTION — only for serving-based foods. Foods referenced
          by a base unit (per-100 g / per-100 ml) carry no canonical
          "serving" row; their unit grid is just conversion ratios
          (0.4227 cup, 3.3814 fl oz…), which read as noise here, so hide it. */}
      {food.servings.length > 0 && food.servings.some((s) => s.unit === "serving") && (
        <div style={{ marginBottom: "1.25rem" }}>

          {/* HEADING */}
          <div className="section-heading" style={{ paddingLeft: 0, marginBottom: "0.5rem" }}>
            Serving Sizes
          </div>

          {/* SERVING PILLS */}
          <div className="flex flex-wrap gap-2">
            {food.servings.map((s) => (
              <div
                key={s.id}
                className="sub-card"
                style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
              >
                <span className="text-primary" style={{ fontWeight: 600 }}>{s.units_per_serving}</span>
                <span className="text-muted"> {s.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECIPE INGREDIENTS — recipe-source foods ship their ingredient list on
          the food payload; surface it here so viewing a recipe (incl. from the
          diary timeline's "View food") shows what's in it. */}
      {food.source === "recipe" && <RecipeIngredientsView ingredients={food.ingredients ?? []} />}

      {/* NUTRIENT BREAKDOWN */}
      <FoodNutrientBreakdown nutrients={nutrients} foodNutrients={foodNutrients} />

      {/* USAGE — how often this food has been logged (counts + weekly chart) */}
      <FoodUsageCard foodId={food.id} />

      {/* USED IN RECIPES — parent recipes that include this food */}
      <div style={{ marginTop: "1.25rem" }}>
        <RecipeUsageList foodId={food.id} />
      </div>
    </>
  );
}

// Per-section accent (the thin consumption fill only) comes from the ledger's
// SECTION_COLORS via sectionColor(), shared with the Nutrition overview page so
// the two can't drift.

export function FoodNutrientBreakdown({
  nutrients,
  foodNutrients,
}: {
  nutrients: Nutrient[];
  foodNutrients: FoodNutrient[];
}) {
  // DATA — resolved per-nutrient target bands (active program override or FDA
  // default — the API returns one band per nutrient, so this IS the source of
  // truth; no client-side default fallback). Module-cached.
  const { bands, loaded: bandsLoaded } = useNutrientTargets();
  const bandByCode = useMemo(() => new Map(bands.map((b) => [b.code, b])), [bands]);

  const amountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const fn of foodNutrients) {
      map.set(fn.nutrient_id, Number(fn.amount) || 0);
    }
    return map;
  }, [foodNutrients]);

  const hasAny = foodNutrients.length > 0;
  if (!hasAny) return null;

  // Wait for the resolved targets before rendering any bars — never paint an
  // FDA-default band that then snaps to the program band.
  if (!bandsLoaded || nutrients.length === 0) {
    return (
      /* BREAKDOWN LOADING */
      <div className="loading-container"><div className="loading-spinner" /></div>
    );
  }

  // Assemble the visible sections up front so the staggered reveal can index
  // each block — empty buckets drop out without leaving a gap in the cadence.
  const sections = NUTRIENT_BUCKETS.map((b) => ({
    heading: b.heading,
    // Show every nutrient in the bucket — including no-DV supplements
    // (caffeine, water) at 0 — so nothing is left out of the breakdown.
    rows: nutrients
      .filter((n) => b.match(n))
      .sort(byNutrientOrder),
  })).filter((s) => s.rows.length > 0);

  return (
    <>
      {sections.map((section, i) => {
        const accent = sectionColor(section.heading);
        return (

          /* BREAKDOWN SECTION — one labelled, grouped surface (matches the
             nutrition overview) instead of a stack of floating cards */
          <div key={section.heading} className="fnb-section fnb-reveal" style={{ animationDelay: `${i * 60}ms` }}>

            {/* SECTION HEADER — title + trailing rule + nutrient count */}
            <div className="fnb-section-head">

              {/* TITLE */}
              <h3>{section.heading}</h3>

              {/* RULE */}
              <div className="fnb-section-rule" />

              {/* COUNT */}
              <span className="fnb-section-count">{section.rows.length}</span>
            </div>

            {/* GROUPED LIST — divided rows share a single border */}
            <div className="fnb-group">
              {section.rows.map((n) => (
                <FoodNutrientRow key={n.id} nutrient={n} amount={amountById.get(n.id) ?? 0} accent={accent} band={bandByCode.get(n.code)} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ─── NUTRIENT ROW ───
   One hairline-divided row: name (+ program-target glyph) + "amount / band unit"
   + % on the top line, the shared floor/target/ceiling meter below. The serving's
   contribution is plotted against the user's resolved band, exactly like the
   Nutrition overview. No band at all → "No Target", no bar. */
function FoodNutrientRow({ nutrient, amount, accent, band }: { nutrient: Nutrient; amount: number; accent: string; band: ResolvedNutrientTarget | undefined }) {
  // The resolved band IS the band — the API returns one per nutrient (program
  // override or FDA default). No client-side fallback; a nutrient with no band
  // simply has no markers ("No Target"). Parent gates on targets being loaded.
  const meterBand: NutrientBand = {
    value: amount,
    floor: band ? band.floor : null,
    target: band ? band.target : null,
    ceiling: band ? band.ceiling : null,
  };
  const d = bandDisplay(meterBand, nutrient.unit);

  return (
    /* NUTRIENT ROW */
    <div className="fnb-row">

      {/* NAME + VALUE + PERCENT */}
      <div className="fnb-row-top">

        {/* NAME + PROGRAM-TARGET GLYPH */}
        <span className="fnb-name-wrap">

          {/* NAME */}
          <span className="fnb-name">{nutrient.name}</span>

          {/* PROGRAM-TARGET GLYPH — bullseye when the band is a program override */}
          {isProgramTarget(band) && <ProgramTargetMark />}
        </span>

        {/* VALUE + PERCENT */}
        <div className="fnb-figures">

          {/* VALUE */}
          <span className="fnb-value">
            <b>{fmtNutrient(amount)}</b>{d.targetText}
          </span>

          {/* PERCENT / NO TARGET */}
          <span className="fnb-pct" data-bar={d.showBar ? "true" : "false"} style={{ color: d.pctColor }}>
            {d.pctText}
          </span>
        </div>
      </div>

      {/* METER */}
      {d.showBar && (
        <div style={{ marginTop: 7 }}>
          <NutrientMeter band={meterBand} fillColor={accent} />
        </div>
      )}
    </div>
  );
}
