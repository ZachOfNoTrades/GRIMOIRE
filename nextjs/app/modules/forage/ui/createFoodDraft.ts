"use client";

/* ─── CREATE-FOOD DRAFT ───

   A snapshot of the Create-Food wizard's in-progress form, parked in
   localStorage so a half-written food survives the browser being killed and
   restored underneath the user.

   The case this exists for: "Scan front" / "Scan label" hand the phone to the
   system camera app, which pushes the browser to the background. Android is
   free to reclaim it there, and Firefox then brings the tab back by RELOADING
   the page — so by the time the user returns from the shutter, every piece of
   React state is gone and the logger has closed itself.

   localStorage, not sessionStorage, and that is measured rather than assumed.
   sessionStorage is the better fit on paper (per-tab, so a draft can't surface
   in a second tab), but on Firefox Android it does NOT survive the content
   process being killed — a probe written before the kill reads back null after
   the tab is restored, while a localStorage probe reads back intact. Since the
   process kill IS the failure this exists for, sessionStorage would store the
   draft in the one place that cannot return it.

   Cross-tab bleed is bounded instead: the draft is cleared on every deliberate
   exit (save, cancel, closing the logger) and expires after MAX_AGE_MS, so the
   only thing that ever leaves one behind is the abnormal teardown. */

import type { FoodUnit } from "../types/unit";

export type CreateFoodDraftHost = "logger" | "page";

export type CreateFoodDraft = {
  // Which wizard instance owns this draft. The logger overlay and the
  // /library/new page each restore only their own, so one never resumes into
  // the other.
  host: CreateFoodDraftHost;
  // Epoch ms of the last write, so a long-abandoned draft is not resumed.
  savedAt: number;
  step: number;
  name: string;
  brand: string;
  barcodeUpc: string;
  sourceUrl: string;
  imageSourceUrl: string | null;
  isGlobal: boolean;
  kcal: string;
  p: string;
  c: string;
  f: string;
  servings: { unit: string; ups: string }[];
  basis: "serving" | "100g" | "100ml";
  portionAmount: string;
  portionQty: string;
  portionName: string;
  nutrientAmounts: Record<string, string>;
  icon: string | null;
  servingSizeStated: boolean;
  // Scan-proposed units not yet in the catalog; absent on drafts written before this existed.
  tempUnits?: FoodUnit[];
};

const KEY = "forage.createFoodDraft";

// How long a stranded draft stays resumable. Long enough to cover a camera
// round-trip plus the user being interrupted; short enough that yesterday's
// abandoned form never reopens itself.
const MAX_AGE_MS = 30 * 60 * 1000;

// Slack allowed on a draft stamped slightly in the future.
const CLOCK_SKEW_MS = 60 * 1000;

/* Every field the wizard reads back, checked before it is trusted — a value
   truncated by a teardown mid-write would otherwise throw on the first
   `.trim()` and take the whole page down with it. */
function isWellFormed(draft: unknown): draft is CreateFoodDraft {
  if (!draft || typeof draft !== "object") return false;
  const d = draft as Record<string, unknown>;
  const strings = ["name", "brand", "barcodeUpc", "sourceUrl", "kcal", "p", "c", "f", "portionAmount", "portionQty", "portionName"];
  return (
    (d.host === "logger" || d.host === "page") &&
    typeof d.savedAt === "number" &&
    typeof d.step === "number" &&
    typeof d.isGlobal === "boolean" &&
    typeof d.servingSizeStated === "boolean" &&
    (d.basis === "serving" || d.basis === "100g" || d.basis === "100ml") &&
    (d.imageSourceUrl === null || typeof d.imageSourceUrl === "string") &&
    (d.icon === null || typeof d.icon === "string") &&
    (d.tempUnits === undefined ||
      (Array.isArray(d.tempUnits) &&
        d.tempUnits.every((u) => u && typeof (u as FoodUnit).id === "string" && typeof (u as FoodUnit).name === "string"))) &&
    Array.isArray(d.servings) &&
    d.servings.every((s) => s && typeof (s as ServingRow).unit === "string" && typeof (s as ServingRow).ups === "string") &&
    !!d.nutrientAmounts &&
    typeof d.nutrientAmounts === "object" &&
    strings.every((k) => typeof d[k] === "string")
  );
}

type ServingRow = { unit: string; ups: string };

export function readCreateFoodDraft(host: CreateFoodDraftHost): CreateFoodDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CreateFoodDraft;
    if (!isWellFormed(draft) || draft.host !== host) return null;
    // A stamp far in the future is a wrong clock, not a fresh draft, so it gets
    // the same treatment as an expired one. The tolerance absorbs ordinary
    // device-clock jitter between the write and this read.
    const age = Date.now() - draft.savedAt;
    if (!(age >= -CLOCK_SKEW_MS && age < MAX_AGE_MS)) return null;
    return draft;
  } catch {
    // Unparsable or storage-blocked — behave exactly as if nothing was saved.
    return null;
  }
}

export function writeCreateFoodDraft(draft: CreateFoodDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Quota, or a privacy mode that blocks storage. Nothing to do: the draft
    // simply isn't recoverable, which is the behavior we had before.
  }
}

export function clearCreateFoodDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // See writeCreateFoodDraft.
  }
}

/* True when a draft holds work worth resuming. A wizard the user opened and
   immediately lost is not worth reopening on their behalf — only one they had
   actually started filling in. */
export function isResumableDraft(draft: CreateFoodDraft | null): draft is CreateFoodDraft {
  if (!draft) return false;
  return Boolean(
    draft.name.trim() ||
      draft.brand.trim() ||
      draft.barcodeUpc.trim() ||
      draft.sourceUrl.trim() ||
      draft.kcal.trim() ||
      draft.p.trim() ||
      draft.c.trim() ||
      draft.f.trim() ||
      draft.icon ||
      draft.step > 0 ||
      Object.keys(draft.nutrientAmounts).length > 0
  );
}
