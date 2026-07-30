"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import type { Equipment, EquipmentOption } from "../../types/location";
import { CATEGORY_ICONS } from "./equipmentCategories";
import "./equipmentModal.css";

interface EquipmentOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment | null;
  allOptions: EquipmentOption[];          // ALL options for this equipment id
  initialSelectedIds: string[];           // currently selected at the location
  onDone: (selectedIds: string[]) => void; // empty array = de-select the equipment
}

export default function EquipmentOptionsModal({
  isOpen,
  onClose,
  equipment,
  allOptions,
  initialSelectedIds,
  onDone,
}: EquipmentOptionsModalProps) {

  // STATE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(initialSelectedIds));
    }
  }, [isOpen, initialSelectedIds]);

  if (!equipment) return null;

  const options = allOptions.filter((o) => o.equipment_id === equipment.id);
  const allIds = options.map((o) => o.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => setSelectedIds(new Set(allIds));
  const clearAll = () => setSelectedIds(new Set());

  const handleDone = () => {
    onDone(Array.from(selectedIds));
    onClose();
  };

  // Numeric options (weight plates, dumbbells, etc.) render as a dense grid; non-numeric
  // (band tension labels like "Heavy") stay single-column since the label is the whole point.
  const isNumeric = options.some((o) => o.value_kg !== null);
  const CategoryIcon = CATEGORY_ICONS[equipment.category];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {equipment.has_image ? (
            <img src={`/modules/golem/api/equipment/${equipment.id}/image`} alt="" className="eq-row-thumb" />
          ) : (
            <CategoryIcon className="w-4 h-4" />
          )}
          {equipment.name}
        </span>
      }
      zIndex={70}
      subHeader={
        /* SUBHEADER — instruction + quick actions */
        <div className="px-4 pb-2 flex items-center gap-2">
          <Button
            onClick={selectAll}
            className="btn-link"
            disabled={allSelected}
          >
            Select All
          </Button>
          <Button
            onClick={clearAll}
            className="btn-link"
            disabled={selectedIds.size === 0}
          >
            Clear
          </Button>
          <span className="text-secondary text-sm ml-auto">
            {selectedIds.size} of {options.length}
          </span>
        </div>
      }
      footer={
        <>
          {/* CANCEL */}
          <Button onClick={onClose} className="btn-link mr-auto">
            Cancel
          </Button>

          {/* DONE */}
          <Button onClick={handleDone} className="btn-blue">
            Done
          </Button>
        </>
      }
    >
      {/* OPTION GRID — the standard checkbox used throughout grimoire */}
      <div className={isNumeric ? "eq-chip-grid grid-cols-4" : "eq-chip-grid grid-cols-1"}>
        {options.map((opt) => {
          const selected = selectedIds.has(opt.id);
          return (
            <label key={opt.id} className="eq-chip">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(opt.id)}
                className="checkbox"
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
