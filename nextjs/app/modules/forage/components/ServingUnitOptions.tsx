"use client";

import { Fragment } from "react";
import { useUnits, unitTypeByName, optionGroups, SERVING_GROUP_MIN } from "../utils/useUnits";
import { CONTAINER_PREFIX } from "../lib/virtualUnits";

// SERVING UNIT OPTIONS — the <option>/<optgroup> children for any "which unit of THIS
// food" dropdown (log-time picker, inline diary row editor, recipe ingredient row).
// The options are the food's own serving rows, so the value is a serving id, not a
// unit name; the type each row groups under comes from the unit catalog (so a custom
// unit the user filed under Volume groups there) and falls back to the conversion
// tables for names the catalog doesn't carry — "serving" itself, and any unit left
// stale on a food after its custom unit was deleted. The food's containers follow
// under their own Containers group.
export function ServingUnitOptions({
  servings,
}: {
  servings: { id: string; unit: string }[];
}) {
  const units = useUnits();
  const unitServings = servings.filter((s) => !s.id.startsWith(CONTAINER_PREFIX));
  const containerServings = servings.filter((s) => s.id.startsWith(CONTAINER_PREFIX));
  const groups = optionGroups(unitServings, (s) => unitTypeByName(units, s.unit), SERVING_GROUP_MIN);

  const option = (s: { id: string; unit: string }) => (
    <option key={s.id} value={s.id}>
      {s.unit}
    </option>
  );

  return (
    <>

      {/* UNIT OPTIONS */}
      {!groups
        ? unitServings.map(option)
        : groups.map((g) => (
            <optgroup key={g.type} label={g.label}>
              {g.items.map(option)}
            </optgroup>
          ))}

      {/* CONTAINER OPTIONS */}
      {containerServings.length > 0 && <optgroup label="Containers">{containerServings.map(option)}</optgroup>}
    </>
  );
}
