"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/lib/useConfirm";
import { selectOnFocus, blurOnEnter } from "@/lib/inputBehavior";
import { WeightEntry } from "../../types/weight";
import { lbInUnit, toLb, unitLabel } from "../../utils/units";
import { useWeightUnit } from "../../utils/useWeightUnit";

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function LogWeighInModal({
  isOpen,
  onClose,
  editing,
  onSaved,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: WeightEntry | null;
  onSaved: (entry: WeightEntry) => void;
  onDeleted: (date: string) => void;
}) {
  const weightUnit = useWeightUnit();
  const { confirm, confirmModal } = useConfirm();

  // INPUT — `weightDisplay` carries the value in whatever unit the user is on.
  // `editing.weight_lb` is the canonical stored value; we surface it in the
  // user's unit so the input matches the label.
  const [logDate, setLogDate] = useState(editing?.log_date ?? todayIso());
  const [weightDisplay, setWeightDisplay] = useState(
    editing ? lbInUnit(editing.weight_lb, weightUnit).toFixed(1) : "",
  );
  const [bodyFat, setBodyFat] = useState(editing?.body_fat_pct != null ? String(editing.body_fat_pct) : "");

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!weightDisplay || Number(weightDisplay) <= 0) {
      toast.error("Enter a weight");
      return;
    }
    setIsSaving(true);
    try {
      const weightLb = toLb(Number(weightDisplay), weightUnit);
      const res = await fetch(`/modules/forage/api/weight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          log_date: logDate,
          weight_lb: Math.round(weightLb * 100) / 100,
          body_fat_pct: bodyFat === "" ? null : Number(bodyFat),
        }),
      });
      if (res.ok) {
        const entry = await res.json();
        toast.success("Logged");
        onSaved(entry);
        onClose();
      } else toast.error("Failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    // zIndex above the base weigh-in modal (backdrop z-index 50) so the confirm sits on top.
    if (!(await confirm({ title: "Delete Weigh-in", message: `Delete weigh-in from ${editing.log_date}?`, confirmLabel: "Delete", danger: true, zIndex: 70 }))) return;
    const res = await fetch(`/modules/forage/api/weight/${editing.log_date}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(editing.log_date);
      onClose();
    } else toast.error("Failed");
  }

  return (
    <>
    {/* WEIGH-IN MODAL */}
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scale weight"
      disableClose={isSaving}
      modalActions={
        editing ? (
          /* DELETE ICON */
          <Button className="btn-link-red" onClick={handleDelete} aria-label="Delete weigh-in" disabled={isSaving}>
            <Trash2 className="w-4 h-4" />
          </Button>
        ) : undefined
      }
      footer={
        /* SAVE */
        <Button className="btn-blue" onClick={handleSave} disabled={isSaving} style={{ width: "100%" }}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      }
    >
      {/* DATE */}
      <div className="flex flex-col gap-1" style={{ marginBottom: "0.75rem" }}>
        <label className="text-label" htmlFor="weigh-date">Date</label>
        <input id="weigh-date" type="date" className="input-field" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
      </div>

      {/* WEIGHT + BODY FAT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>

        {/* WEIGHT */}
        <div className="flex flex-col gap-1">
          <label className="text-label" htmlFor="weigh-value">Weight ({unitLabel(weightUnit)})</label>
          <input id="weigh-value" type="number" inputMode="decimal" step="0.1" className="input-field" value={weightDisplay} onChange={(e) => setWeightDisplay(e.target.value)} onFocus={selectOnFocus} onKeyDown={blurOnEnter} placeholder="0.0" />
        </div>

        {/* BODY FAT */}
        <div className="flex flex-col gap-1">
          <label className="text-label" htmlFor="weigh-bf">Body fat (%)</label>
          <input id="weigh-bf" type="number" inputMode="decimal" step="0.1" className="input-field" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} onFocus={selectOnFocus} onKeyDown={blurOnEnter} placeholder="optional" />
        </div>
      </div>
    </Modal>

    {/* DELETE-WEIGH-IN CONFIRM MODAL */}
    {confirmModal}
    </>
  );
}
