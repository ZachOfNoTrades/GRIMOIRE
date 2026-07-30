"use client";

import { selectOnFocus } from "@/lib/inputBehavior";
import { Nutrient } from "../../types/food";
import { resolveScheme, MACRO_BREAKDOWN_SCHEME, type ResolvedItem } from "../../utils/nutrientLedger";
import "./programNutrientGoals.css";

// One editable override row in the wizard. Markers are kept as strings so a
// blank field (the FDA placeholder showing) stays distinct from a typed value.
export interface GoalRow {
  nutrientId: string;
  floor: string;
  target: string;
  ceiling: string;
}

type Marker = "floor" | "target" | "ceiling";

const MARKERS: { key: Marker; label: string; def: (n: Nutrient) => number | null }[] = [
  { key: "floor", label: "Floor", def: (n) => n.default_floor },
  { key: "target", label: "Target", def: (n) => n.default_target },
  { key: "ceiling", label: "Ceiling", def: (n) => n.default_ceiling },
];

// Validate one row against its EFFECTIVE band (a typed marker, else the FDA
// default): a value must be a non-negative number, and the band must read
// floor ≤ target ≤ ceiling. Returns the offending markers + a message, or null
// when valid. Shared by the step (inline highlight) and the wizard (block submit)
// so the two can never disagree.
export function goalRowError(n: Nutrient, r: GoalRow): { markers: Set<Marker>; message: string } | null {
  for (const key of ["floor", "target", "ceiling"] as Marker[]) {
    const raw = r[key].trim();
    if (raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return { markers: new Set([key]), message: "Must be a non-negative number" };
  }
  const eff = (s: string, def: number | null) => (s.trim() === "" ? def : Number(s));
  const f = eff(r.floor, n.default_floor);
  const t = eff(r.target, n.default_target);
  const c = eff(r.ceiling, n.default_ceiling);
  if (f != null && t != null && f > t) return { markers: new Set(["floor", "target"]), message: "Floor can’t exceed target" };
  if (t != null && c != null && t > c) return { markers: new Set(["target", "ceiling"]), message: "Target can’t exceed ceiling" };
  if (f != null && c != null && f > c) return { markers: new Set(["floor", "ceiling"]), message: "Floor can’t exceed ceiling" };
  return null;
}

export default function ProgramNutrientGoals({
  nutrients,
  rows,
  onChange,
  isLoading,
}: {
  nutrients: Nutrient[];
  rows: GoalRow[];
  onChange: (rows: GoalRow[]) => void;
  isLoading: boolean;
}) {
  // Lookups: DB nutrient by code (the ledger orders by code; the DB row carries
  // the id + default band) + the editable row by nutrient id.
  const byCode = new Map(nutrients.map((n) => [n.code, n]));
  const rowById = new Map(rows.map((r) => [r.nutrientId, r]));

  // Order + sectioning come from the nutrient ledger's macro-breakdown scheme
  // (single source of truth), NOT the DB display_order. Keep the macros/micros
  // split: drop the Macros section and any macro items (macros aren't nutrients
  // and have no override band), so only micronutrients (kind === "micro") that
  // exist in the DB reference list get an editable goal row. Ledger micros absent
  // from the DB (e.g. unseeded creatine) are skipped; empty sections are hidden.
  const groups = resolveScheme(MACRO_BREAKDOWN_SCHEME)
    .filter((section) => section.heading !== "Macros")
    .map((section) => ({
      heading: section.heading,
      nutrients: section.items
        .filter((item): item is Extract<ResolvedItem, { kind: "micro" }> => item.kind === "micro")
        .map((item) => byCode.get(item.code))
        .filter((nutrient): nutrient is Nutrient => nutrient != null),
    }))
    .filter((group) => group.nutrients.length > 0);

  function updateMarker(id: string, key: Marker, value: string) {
    onChange(rows.map((r) => (r.nutrientId === id ? { ...r, [key]: value } : r)));
  }

  if (isLoading) {
    /* LOADING */
    return <div className="loading-container"><div className="loading-spinner" /></div>;
  }

  return (
    /* STEP BODY */
    <div className="nutr-goals">

      {/* TITLE */}
      <h2 className="text-card-title" style={{ marginBottom: "0.5rem" }}>Custom nutrient goals</h2>

      {/* INTRO */}
      <div className="text-subtle" style={{ marginBottom: "1rem" }}>
        Optional. Set a floor, target, or ceiling for any nutrient. Blank fields keep the standard
        (FDA) value shown as the placeholder.
      </div>

      {/* GROUPS */}
      {groups.map((group) => (
        /* GROUP */
        <div key={group.heading} className="nutr-goals-group">

          {/* GROUP HEADING + COLUMN LABELS */}
          <div className="nutr-goals-colhead">
            <h3 className="nutr-goals-heading">{group.heading}</h3>
            {MARKERS.map((m) => (
              <span key={m.key} className="nutr-goals-collabel">{m.label}</span>
            ))}
          </div>

          {/* NUTRIENT ROWS */}
          {group.nutrients.map((n) => {
            const row = rowById.get(n.id) ?? { nutrientId: n.id, floor: "", target: "", ceiling: "" };
            const error = goalRowError(n, row);
            return (
              /* NUTRIENT ROW */
              <div key={n.id} className="nutr-goals-rowwrap">

                {/* INPUT GRID */}
                <div className="nutr-goals-row">

                  {/* NAME */}
                  <span className="nutr-goals-name">
                    {n.name}<span className="nutr-goals-unit">{n.unit}</span>
                  </span>

                  {/* MARKER INPUTS */}
                  {MARKERS.map((m) => {
                    const def = m.def(n);
                    const invalid = error?.markers.has(m.key) ?? false;
                    return (
                      <input
                        key={m.key}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        /* min-width:0 overrides the global .input-field 120px floor so
                           the markers fit the grid instead of overflowing. */
                        className={`input-field nutr-goals-input${invalid ? " nutr-goals-input--invalid" : ""}`}
                        style={{ minWidth: 0 }}
                        placeholder={def != null ? String(def) : "—"}
                        value={row[m.key]}
                        aria-label={`${n.name} ${m.label}`}
                        aria-invalid={invalid || undefined}
                        onFocus={selectOnFocus}
                        onChange={(e) => updateMarker(n.id, m.key, e.target.value)}
                      />
                    );
                  })}
                </div>

                {/* ERROR — floor/target/ceiling out of order */}
                {error && <div className="nutr-goals-error">{error.message}</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
