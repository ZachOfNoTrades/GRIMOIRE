"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type {
  Equipment,
  EquipmentOption,
  LocationEquipmentSelection,
  LocationWithEquipment,
} from "../../types/location";
import EquipmentOptionsModal from "./EquipmentOptionsModal";
import { CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_ORDER } from "./equipmentCategories";
import "./equipmentModal.css";

interface LocationEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: LocationWithEquipment | null;
  equipment: Equipment[];
  options: EquipmentOption[];
  onSaved: (updated: LocationWithEquipment) => void;
}

export default function LocationEquipmentModal({
  isOpen,
  onClose,
  location,
  equipment,
  options,
  onSaved,
}: LocationEquipmentModalProps) {

  // STATE
  // selectionMap: equipment_id -> option_ids[] (empty array means equipment is on with no options or has_options=0)
  // Absence from map = equipment is OFF.
  const [selectionMap, setSelectionMap] = useState<Map<string, string[]>>(new Map());
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(CATEGORY_ORDER));
  const [optsForEquipment, setOptsForEquipment] = useState<Equipment | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync from location whenever modal opens.
  useEffect(() => {
    if (!isOpen || !location) return;
    const m = new Map<string, string[]>();
    for (const s of location.selections) m.set(s.equipment_id, [...s.option_ids]);
    setSelectionMap(m);
    setFilter("all");
    setSearch("");
  }, [isOpen, location]);

  // Index options by equipment id
  const optionsByEquipment = useMemo(() => {
    const m = new Map<string, EquipmentOption[]>();
    for (const o of options) {
      if (!m.has(o.equipment_id)) m.set(o.equipment_id, []);
      m.get(o.equipment_id)!.push(o);
    }
    return m;
  }, [options]);

  // Group equipment by category, preserving sort_order.
  const categorized = useMemo(() => {
    const groups = new Map<string, Equipment[]>();
    for (const e of equipment) {
      if (!groups.has(e.category)) groups.set(e.category, []);
      groups.get(e.category)!.push(e);
    }
    return groups;
  }, [equipment]);

  // Human caption for a has_options row — a range when the selection reads as one
  // ("10–75 lb (18 of 20)"), else a plain count ("3 of 4 sizes" for non-numeric bands).
  const sizeCaption = (eq: Equipment): string | null => {
    if (!eq.has_options) return null;
    const selectedIds = new Set(selectionMap.get(eq.id) ?? []);
    if (selectedIds.size === 0) return null;
    const all = (optionsByEquipment.get(eq.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    if (all.length === 0) return null;
    if (selectedIds.size === all.length) return `All ${all.length} sizes`;
    const selected = all.filter((o) => selectedIds.has(o.id));
    const isNumeric = all.every((o) => o.value_kg !== null);
    const first = selected[0];
    const last = selected[selected.length - 1];
    const range = isNumeric && first && last && first.id !== last.id ? `${first.label}–${last.label}` : null;
    return range ? `${range} (${selected.length} of ${all.length})` : `${selected.length} of ${all.length} sizes`;
  };

  const isSelected = (eqId: string) => selectionMap.has(eqId);

  const toggleEquipment = (eq: Equipment) => {
    const next = new Map(selectionMap);
    if (next.has(eq.id)) {
      next.delete(eq.id);
    } else {
      // Auto-select all options when turning on a has_options equipment.
      if (eq.has_options) {
        const all = optionsByEquipment.get(eq.id) ?? [];
        next.set(eq.id, all.map((o) => o.id));
      } else {
        next.set(eq.id, []);
      }
    }
    setSelectionMap(next);
  };

  const toggleCategoryExpand = (cat: string) => {
    const next = new Set(expanded);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpanded(next);
  };

  const openOptionsFor = (eq: Equipment) => {
    setOptsForEquipment(eq);
  };

  const handleOptionsDone = (selectedIds: string[]) => {
    if (!optsForEquipment) return;
    const next = new Map(selectionMap);
    if (selectedIds.length === 0) {
      // Empty = de-select the equipment entirely.
      next.delete(optsForEquipment.id);
    } else {
      next.set(optsForEquipment.id, selectedIds);
    }
    setSelectionMap(next);
  };

  const handleSave = async () => {
    if (!location) return;
    setIsSaving(true);
    try {
      const selections: LocationEquipmentSelection[] = Array.from(selectionMap.entries()).map(
        ([equipment_id, option_ids]) => ({ equipment_id, option_ids }),
      );
      const resp = await fetch(`/modules/golem/api/locations/${location.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Save failed" }));
        toast.error(err.error || "Save failed");
        return;
      }
      const updated: LocationWithEquipment = await resp.json();
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error("Error saving location equipment:", err);
      toast.error("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  if (!location) return null;

  // Total selected for header summary.
  const totalSelected = selectionMap.size;
  const isSearching = search.trim().length > 0;
  const searchLower = search.trim().toLowerCase();

  // Resolve each category to its visible rows once, so we can tell "nothing anywhere
  // matched the search" apart from "every matching category is just collapsed".
  const renderableCategories = CATEGORY_ORDER.map((cat) => {
    const items = (categorized.get(cat) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const searched = isSearching ? items.filter((e) => e.name.toLowerCase().includes(searchLower)) : items;
    const visible = filter === "selected" ? searched.filter((e) => isSelected(e.id)) : searched;
    return { cat, items, visible, selectedInCat: items.filter((e) => isSelected(e.id)).length };
  }).filter((c) => c.visible.length > 0);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        fullHeight
        title="Available Equipment"
        disableClose={isSaving}
        subHeader={
          /* SUBHEADER — location name + All/Selected toggle, then a search row */
          <div className="px-4 pb-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-secondary">{location.name} — {totalSelected} selected</span>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => setFilter("all")}
                  className={filter === "all" ? "btn-blue" : "btn-off"}
                >
                  All
                </Button>
                <Button
                  onClick={() => setFilter("selected")}
                  className={filter === "selected" ? "btn-blue" : "btn-off"}
                >
                  Selected
                </Button>
              </div>
            </div>

            {/* SEARCH — the catalog spans 9 categories, this jumps straight to one item */}
            <input
              type="text"
              placeholder="Search equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              aria-label="Search equipment"
            />
          </div>
        }
        footer={
          <>
            {/* CANCEL */}
            <Button onClick={onClose} disabled={isSaving} className="btn-link mr-auto">
              Cancel
            </Button>

            {/* SAVE */}
            <Button onClick={handleSave} disabled={isSaving} className="btn-blue">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </Button>
          </>
        }
      >
        {/* NO MATCHES */}
        {renderableCategories.length === 0 && (
          <p className="text-secondary text-center">
            {isSearching ? `No equipment matches "${search.trim()}".` : "Nothing selected yet."}
          </p>
        )}

        {/* CATEGORIES */}
        <div className="flex flex-col gap-3">
          {renderableCategories.map(({ cat, items, visible, selectedInCat }) => {
            const isExpanded = isSearching || expanded.has(cat);
            const CategoryIcon = CATEGORY_ICONS[cat];

            return (
              /* CATEGORY SECTION */
              <div key={cat}>

                {/* HEADER — click to collapse/expand */}
                <div
                  className="sub-card-header cursor-pointer"
                  onClick={() => toggleCategoryExpand(cat)}
                >
                  <h3 className="text-card-title eq-category-title flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <CategoryIcon className="w-4 h-4" />
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <span className="text-secondary text-sm">
                    {selectedInCat} of {items.length}
                  </span>
                </div>
                <hr className="eq-category-divider" />

                {/* CONTENT — checklist ledger of equipment toggles */}
                {isExpanded && (
                  <div className="eq-ledger">
                    {visible.map((eq) => {
                      const selected = isSelected(eq.id);
                      const caption = sizeCaption(eq);

                      return (
                        /* EQUIPMENT ROW */
                        <div key={eq.id} className="eq-row-wrap">

                          {/* MAIN TOGGLE — the standard checkbox used throughout grimoire */}
                          <label className="eq-row">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleEquipment(eq)}
                              className="checkbox"
                            />
                            {eq.has_image && (
                              <img
                                src={`/modules/golem/api/equipment/${eq.id}/image`}
                                alt=""
                                className="eq-row-thumb"
                                loading="lazy"
                              />
                            )}
                            <span className="eq-row-name">{eq.name}</span>
                            {caption && (
                              <>
                                <span className="eq-leader" aria-hidden="true" />
                                <span className="eq-row-caption">{caption}</span>
                              </>
                            )}
                          </label>

                          {/* SIZES DRILL-DOWN — only for equipment with selectable sizes/weights */}
                          {eq.has_options && (
                            <Button
                              onClick={() => openOptionsFor(eq)}
                              aria-label={`Configure ${eq.name} sizes`}
                              className="eq-drilldown"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* WEIGHT-PICKER (secondary modal) */}
      <EquipmentOptionsModal
        isOpen={optsForEquipment !== null}
        onClose={() => setOptsForEquipment(null)}
        equipment={optsForEquipment}
        allOptions={options}
        initialSelectedIds={
          optsForEquipment ? (selectionMap.get(optsForEquipment.id) ?? []) : []
        }
        onDone={handleOptionsDone}
      />
    </>
  );
}
