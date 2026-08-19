"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Apple, Plus } from "lucide-react";
import "./ForageTabBar.css";

/* ─── FORAGE TAB BAR ───
   Shared bottom navigation (MacroFactor-style) used across the forage module:
   Dashboard · Food Log · (+) · Strategy · More. Extracted from the dashboard so
   every full-height forage screen renders the same bar. Self-contained styling
   in ForageTabBar.css — it does NOT depend on the `.forage-home` shell, so the
   FAB's radius rescue etc. work on any page. Navigation is handled internally;
   the FAB "+" calls `onAdd` (defaults to deep-linking the food-log add modal). */

export type ForageTab = "dashboard" | "foodlog" | "strategy" | "more";

const ROUTES: Record<ForageTab, string> = {
  dashboard: "/modules/forage/ui/home",
  foodlog: "/modules/forage/ui/foods",
  strategy: "/modules/forage/ui/strategy",
  more: "/modules/forage/ui/settings",
};

export default function ForageTabBar({
  active,
  onAdd,
  strategyAlert = false,
}: {
  active: ForageTab;
  onAdd?: () => void;
  // When true, paints a "due" dot over the Strategy icon (coached program's
  // weekly check-in is due). Surfaces the reminder on every forage screen, not
  // just the dashboard banner.
  strategyAlert?: boolean;
}) {
  const router = useRouter();

  // The FAB defaults to the food-log add modal via its ?add=1 deep link; pages
  // with their own quick-add (dashboard shortcuts sheet, food-log add) override.
  const handleAdd = onAdd ?? (() => router.push("/modules/forage/ui/foods?add=1"));

  return (
    /* TAB BAR — paddingBottom (in CSS) honors safe-area so the tappable content
       clears the phone's gesture/home-indicator strip. */
    <div className="fg-tabbar" role="navigation" aria-label="Forage sections">

      {/* DASHBOARD */}
      <TabItem label="Dashboard" active={active === "dashboard"} icon={<DashboardIcon active={active === "dashboard"} />} href={ROUTES.dashboard} />

      {/* FOOD LOG */}
      <TabItem label="Food Log" active={active === "foodlog"} icon={<Apple size={22} strokeWidth={1.8} />} href={ROUTES.foodlog} />

      {/* FAB + */}
      <button type="button" aria-label="Quick add" className="fg-tabbar-fab" onClick={handleAdd}>
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {/* STRATEGY — shows a due-dot when the weekly check-in is due. */}
      <TabItem label="Strategy" active={active === "strategy"} alert={strategyAlert} icon={<StrategyIcon active={active === "strategy"} />} href={ROUTES.strategy} />

      {/* MORE */}
      <TabItem label="More" active={active === "more"} icon={<MoreIcon active={active === "more"} />} href={ROUTES.more} />
    </div>
  );
}

function TabItem({ label, icon, active, alert = false, href }: { label: string; icon: React.ReactNode; active: boolean; alert?: boolean; href: string }) {
  return (
    /* TAB ITEM — a real <Link> so middle-click / cmd-click opens the section in a
       new tab. aria-label spells out the alert for screen readers since the dot
       is decorative. */
    <Link
      href={href}
      className="fg-tabbar-item"
      data-active={active ? "true" : undefined}
      aria-label={alert ? `${label} — check-in due` : undefined}
    >
      {/* ICON + DUE DOT — wrapper is the positioning context for the badge. */}
      <span className="fg-tabbar-icon-wrap">
        {icon}
        {alert && <span className="fg-tabbar-badge" aria-hidden="true" />}
      </span>

      {/* LABEL */}
      <span className="fg-tabbar-label">{label}</span>
    </Link>
  );
}

/* Icon color tracks active state via the same design tokens the dashboard used
   (--color-primary / --color-secondary), referenced directly in SVG fills. */
function iconColor(active: boolean): string {
  return active ? "var(--color-primary)" : "var(--color-secondary)";
}

function DashboardIcon({ active }: { active: boolean }) {
  // 2×2 grid; top-left cell filled, the other three outlined.
  const c = iconColor(active);
  return (
    /* DASHBOARD ICON */
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill={c} />
      <rect x="12" y="2" width="8" height="8" rx="1.5" fill="none" stroke={c} strokeWidth="1.6" />
      <rect x="2" y="12" width="8" height="8" rx="1.5" fill="none" stroke={c} strokeWidth="1.6" />
      <rect x="12" y="12" width="8" height="8" rx="1.5" fill="none" stroke={c} strokeWidth="1.6" />
    </svg>
  );
}

function StrategyIcon({ active }: { active: boolean }) {
  // Three circles in MF's "Strategy" triangle.
  const c = iconColor(active);
  return (
    /* STRATEGY ICON */
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="6" cy="7" r="2.4" stroke={c} strokeWidth="1.6" fill="none" />
      <circle cx="16" cy="7" r="2.4" stroke={c} strokeWidth="1.6" fill="none" />
      <circle cx="11" cy="16" r="2.4" stroke={c} strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  // Outlined circle with three horizontal dots.
  const c = iconColor(active);
  return (
    /* MORE ICON */
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" stroke={c} strokeWidth="1.6" fill="none" />
      <circle cx="6.5" cy="11" r="1.2" fill={c} />
      <circle cx="11" cy="11" r="1.2" fill={c} />
      <circle cx="15.5" cy="11" r="1.2" fill={c} />
    </svg>
  );
}
