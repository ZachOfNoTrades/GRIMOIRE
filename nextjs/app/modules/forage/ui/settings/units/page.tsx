"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import toast, { Toaster } from "react-hot-toast";
import { SettingsBackLink, SettingsRadioGroup } from "@/components/settings/SettingsList";
import { WeightUnit } from "../../../utils/units";
import { invalidateWeightUnit } from "../../../utils/useWeightUnit";

interface UnitOption {
  value: WeightUnit;
  label: string;
}

export default function ForageUnitsPage() {
  const router = useRouter();
  const goBack = useGoBack();

  // DATA / INPUT
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`/modules/forage/api/settings`)
      .then((r) => r.json())
      .then((s: { weight_unit?: WeightUnit }) => {
        if (s.weight_unit === "kg" || s.weight_unit === "lbs") {
          setWeightUnit(s.weight_unit);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

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
        <SettingsBackLink label="Settings" onClick={() => goBack("/modules/forage/ui/settings")} />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Units</h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* WEIGHT UNITS */
          <div>
            <h2 className="settings-section-title">Weight Units</h2>
            <SettingsRadioGroup
              options={weightOptions}
              value={weightUnit}
              disabled={isSaving}
              onChange={pickWeightUnit}
            />
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
