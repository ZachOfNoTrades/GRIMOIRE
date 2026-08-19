"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsBackLink, SettingsRadioGroup } from "@/components/settings/SettingsList";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import HelpButton from "@/components/ui/HelpButton";
import { WeightUnit } from "../../../utils/units";
import { invalidateWeightUnit } from "../../../utils/useWeightUnit";
import { setUnitsCache } from "../../../utils/useUnits";
import { UNIT_TYPE_LABELS, UNIT_TYPES } from "../../../lib/unitFamilies";
import type { FoodUnit, UnitType } from "../../../types/unit";
import { CUSTOM_UNIT_MAX_LEN } from "../../../types/unit";

interface UnitOption {
  value: WeightUnit;
  label: string;
}

export default function ForageUnitsPage() {

  // DATA / INPUT
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [customUnits, setCustomUnits] = useState<FoodUnit[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // The custom unit the editor modal is open for: a FoodUnit when editing an
  // existing one, "new" when adding, null when the modal is closed.
  const [editing, setEditing] = useState<FoodUnit | "new" | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/modules/forage/api/settings`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((s: { weight_unit?: WeightUnit }) => {
          if (s.weight_unit === "kg" || s.weight_unit === "lbs") {
            setWeightUnit(s.weight_unit);
          }
        })
        .catch(() => {}),
      refreshUnits(),
    ]).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read the catalog and push it to every mounted dropdown, so an open food
  // modal elsewhere in the app picks up the change without a reload.
  async function refreshUnits() {
    try {
      const res = await fetch(`/modules/forage/api/units`);
      if (!res.ok) return;
      const all = await res.json();
      if (!Array.isArray(all)) return;
      setUnitsCache(all);
      setCustomUnits((all as FoodUnit[]).filter((u) => u.is_custom));
    } catch {
      /* leave the last known list on screen */
    }
  }

  async function pickWeightUnit(next: WeightUnit) {
    if (next === weightUnit || isSaving) return;
    setIsSaving(true);
    const prev = weightUnit;
    setWeightUnit(next); // optimistic
    invalidateWeightUnit(next);
    try {
      const res = await fetch(`/modules/forage/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weight_unit: next }),
      });
      if (!res.ok) {
        setWeightUnit(prev);
        invalidateWeightUnit(prev);
        toast.error("Failed to save");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function removeUnit(unit: FoodUnit) {
    if (!confirm(`Delete the "${unit.name}" unit? Foods already measured in it keep their serving sizes.`)) return;
    const prev = customUnits;
    setCustomUnits(prev.filter((u) => u.id !== unit.id)); // optimistic
    try {
      const res = await fetch(`/modules/forage/api/units/${unit.id}`, { method: "DELETE" });
      if (!res.ok) {
        setCustomUnits(prev);
        toast.error("Couldn't delete that unit");
        return;
      }
      await refreshUnits();
    } catch {
      setCustomUnits(prev);
      toast.error("Couldn't delete that unit");
    }
  }

  const weightOptions: UnitOption[] = [
    { value: "lbs", label: "Pounds" },
    { value: "kg",  label: "Kilograms" },
  ];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Settings" fallback="/modules/forage/ui/settings" />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>Units</h1>
          <HelpButton
            title="Units"
            sections={[
              { heading: "Weight units", body: "Controls whether weigh-ins and body metrics are shown in pounds or kilograms. Values are stored in pounds and converted for display, so switching never changes your history." },
              { heading: "Custom units", body: "Add your own free-text units — \u201cstick\u201d, \u201cscoop\u201d, \u201csleeve\u201d — so a food's serving sizes can read the way its packaging does. Custom units are yours alone and appear in every unit dropdown alongside the built-in ones." },
              { heading: "Groups", body: "Each unit belongs to a group \u2014 Weight, Volume, or Count & other \u2014 which is how unit dropdowns are sorted into sections. The group is display only: a custom unit has no defined size, so it never converts automatically. Set how many of it make one serving on the food itself." },
              { heading: "Deleting a unit", body: "Foods already measured in a deleted unit keep their serving sizes; the unit just stops being offered for new ones." },
            ]}
          />
        </div>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          <>
            {/* WEIGHT UNITS */}
            <div>
              <h2 className="settings-section-title">Weight Units</h2>
              <SettingsRadioGroup
                options={weightOptions}
                value={weightUnit}
                disabled={isSaving}
                onChange={pickWeightUnit}
              />
            </div>

            {/* CUSTOM MEASUREMENT UNITS */}
            <div>
              <h2 className="settings-section-title">Custom Units</h2>

              {/* CUSTOM UNIT LIST */}
              {customUnits.length > 0 ? (
                <div className="settings-group">
                  {customUnits.map((u, i) => (
                    <div
                      key={u.id}
                      className="fg-unit-row"
                      data-first={i === 0 ? "true" : undefined}
                      data-last={i === customUnits.length - 1 ? "true" : undefined}
                    >
                      {/* NAME + GROUP */}
                      <span className="fg-unit-row-body">
                        <span className="settings-row-label">{u.name}</span>
                        <span className="settings-row-hint">{UNIT_TYPE_LABELS[u.type]}</span>
                      </span>

                      {/* EDIT */}
                      <Button className="btn-link" onClick={() => setEditing(u)} aria-label={`Rename ${u.name}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>

                      {/* DELETE */}
                      <Button className="btn-link-red" onClick={() => removeUnit(u)} aria-label={`Delete ${u.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                /* EMPTY */
                <p className="text-muted" style={{ fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
                  None yet. Add a unit to measure foods the way their packaging reads —
                  &ldquo;stick&rdquo;, &ldquo;scoop&rdquo;, &ldquo;sleeve&rdquo;.
                </p>
              )}

              {/* ADD */}
              <Button className="btn-blue" style={{ marginTop: "0.75rem" }} onClick={() => setEditing("new")}>
                <Plus className="w-4 h-4" /> Add unit
              </Button>
            </div>
          </>
        )}

        {/* EDITOR */}
        {editing && (
          <CustomUnitEditor
            unit={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await refreshUnits();
            }}
          />
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}

/* ============================================================
   CUSTOM UNIT EDITOR — create or rename/re-group one custom unit.
   ============================================================ */

function CustomUnitEditor({
  unit,
  onClose,
  onSaved,
}: {
  unit: FoodUnit | null;
  onClose: () => void;
  onSaved: () => void;
}) {

  // INPUT
  const [name, setName] = useState(unit?.name ?? "");
  const [type, setType] = useState<UnitType>(unit?.type ?? "count");

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        unit ? `/modules/forage/api/units/${unit.id}` : `/modules/forage/api/units`,
        {
          method: unit ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed, type }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Couldn't save that unit");
        return;
      }
      onSaved();
    } catch {
      toast.error("Couldn't save that unit");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    /* CUSTOM UNIT EDITOR */
    <Modal
      isOpen
      onClose={onClose}
      title={unit ? "Edit unit" : "New unit"}
      footer={
        /* ACTIONS */
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>

          {/* CANCEL */}
          <Button className="btn-off" onClick={onClose} disabled={isSaving}>Cancel</Button>

          {/* SAVE */}
          <Button className="btn-blue" onClick={save} disabled={isSaving || !name.trim()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      {/* FORM */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

        {/* NAME */}
        <div className="fg-quick-field">
          <label className="text-label" htmlFor="fg-unit-name">Name</label>
          <input
            id="fg-unit-name"
            className="input-field"
            value={name}
            maxLength={CUSTOM_UNIT_MAX_LEN}
            autoFocus
            placeholder="stick, scoop, sleeve…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          />
        </div>

        {/* GROUP */}
        <div className="fg-quick-field">
          <label className="text-label" htmlFor="fg-unit-type">Group</label>
          <select
            id="fg-unit-type"
            className="input-field"
            value={type}
            onChange={(e) => setType(e.target.value as UnitType)}
          >
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* HINT */}
        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
          The group decides where this unit appears in unit dropdowns. Custom units never
          convert automatically — set how many make one serving yourself.
        </div>
      </div>
    </Modal>
  );
}
