"use client"

import { useEffect, useState } from "react";
import { Equipment } from "../../types/location";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../locations/equipmentCategories";

interface ExerciseEquipmentPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Reusable equipment multi-select used by every exercise-edit surface (session edit modal,
// library detail edit, add modal). Tap a chip to require/unrequire that equipment. Loads the
// full equipment list once and groups it by category, mirroring the muscle-group chip pattern.
export default function ExerciseEquipmentPicker({
  selectedIds,
  onChange,
}: ExerciseEquipmentPickerProps) {

  // DATA
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // STATE
  const [loading, setLoading] = useState(true);

  // Load the equipment catalog once on mount.
  useEffect(() => {
    const fetchEquipment = async () => {
      setLoading(true);
      try {
        const response = await fetch("/modules/golem/api/equipment");
        if (response.ok) {
          const data = await response.json();
          setEquipment(data.equipment ?? []);
        }
      } catch (error) {
        console.error("Error loading equipment:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, []);

  // Toggle a single equipment id in/out of the selection.
  const toggleEquipment = (equipmentId: string) => {
    if (selectedIds.includes(equipmentId)) {
      onChange(selectedIds.filter((id) => id !== equipmentId));
    } else {
      onChange([...selectedIds, equipmentId]);
    }
  };

  // LOADING PLACEHOLDER
  if (loading) {
    return <p className="text-secondary text-sm">Loading equipment...</p>;
  }

  // EMPTY PLACEHOLDER
  if (equipment.length === 0) {
    return <p className="text-secondary text-sm">No equipment available.</p>;
  }

  return (

    // EQUIPMENT GROUPS
    <div className="flex flex-col gap-3">

      {CATEGORY_ORDER.map((category) => {
        const items = equipment.filter((item) => item.category === category);
        if (items.length === 0) return null;

        return (

          // CATEGORY GROUP
          <div key={category} className="flex flex-col gap-1">

            {/* CATEGORY LABEL */}
            <span className="text-xs text-secondary">{CATEGORY_LABELS[category]}</span>

            {/* EQUIPMENT CHIPS */}
            <div className="flex flex-wrap gap-2">
              {items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (

                  // EQUIPMENT CHIP
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleEquipment(item.id)}
                    className={`${isSelected ? "badge-blue" : "badge-gray"} cursor-pointer`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
