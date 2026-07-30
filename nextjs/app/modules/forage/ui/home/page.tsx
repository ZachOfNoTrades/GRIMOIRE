// Forage dashboard route — a SERVER component that preloads the current day's
// macros (target + this week's totals) and hands them to the client dashboard,
// so the first paint shows real numbers instead of flashing empty placeholders
// / a spinner. The interactive UI lives in HomeClient.tsx ("use client").

import { headers } from "next/headers";
import { getAuthorizedUser } from "@/lib/permissions";
import { listEntries, computeTotals } from "../../lib/entryFunctions";
import { getActiveTarget } from "../../lib/targetFunctions";
import { listNutrients } from "../../lib/nutrientFunctions";
import { getResolvedNutrientTargets } from "../../lib/nutrientTargetFunctions";
import { getDashboardCards } from "../../lib/dashboardFunctions";
import { getActiveProgram } from "../../lib/programFunctions";
import { isCheckInDue } from "../../lib/program";
import { DailyTotals } from "../../types/entry";
import { MacroTarget } from "../../types/target";
import { Nutrient, ResolvedNutrientTarget } from "../../types/food";
import ForageHomeClient from "./HomeClient";

// Server-safe copies of the date helpers in _diary (that module is "use client",
// so its exports can't be called here). Kept identical so the SSR-seeded week
// matches what the client would compute. Server timezone is assumed to match the
// user's — true for this single-user homelab deployment.
function serverTodayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function serverShiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function serverWeekStartFor(iso: string): string {
  // ISO week: Monday as first day. Sunday (getDay()===0) maps to offset 6.
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  dt.setDate(dt.getDate() - offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export default async function ForageHomePage() {
  const today = serverTodayIso();

  // Resolve the caller from the incoming request headers. getAuthorizedUser
  // handles a NextAuth cookie session (real browser) as well as X-API-Key /
  // Bearer (smoke tests, MCP). Null → render the client with no seed; it will
  // fall back to its client-side fetch.
  let initialTotals: DailyTotals | null = null;
  let initialTarget: MacroTarget | null = null;
  let initialWeekData: Record<string, DailyTotals> = {};
  // Nutrition-section config (the user's saved card layout + the nutrient
  // reference and resolved target bands those cards render against). Preloaded
  // here so the section paints the user's real settings on first load instead
  // of flashing the built-in default layout while a client fetch resolves.
  // Stays null when unavailable → the client fetches as before.
  let initialNutrients: Nutrient[] | undefined;
  let initialNutrientBands: ResolvedNutrientTarget[] | undefined;
  let initialNutritionCardKeys: string[] | undefined;
  // Whether the coached program's weekly check-in is due today. Computed from a
  // READ-ONLY program fetch (getActiveProgram) so seeding the banner here never
  // triggers the lazy recompute the way GET /api/program does — that side effect
  // would mark the check-in done before the user ever saw the reminder.
  let initialCheckInDue = false;
  let initialCheckInWeekday: number | undefined;

  try {
    const hdrs = await headers();
    const auth = await getAuthorizedUser(new Request("http://internal", { headers: hdrs }));
    const userId = auth?.user.id;

    // Only touch the DB when the SQL env is actually present. In dev, a
    // server-component render can run before/without the Infisical-injected env
    // (hot-reload worker); calling getFoodConnection() with an empty host would
    // fail AND poison the singleton pool promise, breaking the API too. When env
    // is absent we skip the preload and let the client fetch as before.
    if (userId && process.env.SQL_SERVER_URL) {
      const weekStart = serverWeekStartFor(today);
      const days = Array.from({ length: 7 }, (_, i) => serverShiftDate(weekStart, i));
      const [target, nutrients, nutrientBands, nutritionCardKeys, program, ...weekEntries] =
        await Promise.all([
          getActiveTarget(userId, today),
          listNutrients(),
          getResolvedNutrientTargets(userId),
          // Returns the user's saved layout, or DEFAULT_NUTRITION_CARDS when they
          // have no custom config — same fallback the client seed used.
          getDashboardCards(userId, "nutrition"),
          // Read-only — does NOT run the lazy recompute (see the let above).
          getActiveProgram(userId),
          ...days.map((d) => listEntries(userId, d)),
        ]);
      initialTarget = target;
      // Only coached programs have a weekly check-in; mirror the strategy page's
      // "due" logic (today is the check-in weekday and it hasn't run yet today).
      if (program && program.program_style === "coached" && program.check_in_weekday != null) {
        initialCheckInDue = isCheckInDue(program.check_in_weekday, program.last_checkin_date, today);
        initialCheckInWeekday = program.check_in_weekday;
      }
      initialNutrients = nutrients;
      initialNutrientBands = nutrientBands;
      initialNutritionCardKeys = nutritionCardKeys;
      const week: Record<string, DailyTotals> = {};
      days.forEach((d, i) => {
        week[d] = computeTotals(weekEntries[i]);
      });
      initialWeekData = week;
      initialTotals = week[today] ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };
    }
  } catch (error) {
    // Preload is best-effort — on any failure the client fetches as before.
    console.error("Forage home SSR preload failed:", error);
  }

  return (
    <ForageHomeClient
      initialDate={today}
      initialTotals={initialTotals}
      initialTarget={initialTarget}
      initialWeekData={initialWeekData}
      initialNutrients={initialNutrients}
      initialNutrientBands={initialNutrientBands}
      initialNutritionCardKeys={initialNutritionCardKeys}
      initialCheckInDue={initialCheckInDue}
      initialCheckInWeekday={initialCheckInWeekday}
    />
  );
}
