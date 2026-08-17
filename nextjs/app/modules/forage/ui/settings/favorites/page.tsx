"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { SettingsBackLink, SettingsRadioGroup } from "@/components/settings/SettingsList";

// History windows offered for the picker's hourly "favorites" suggestions. `days`
// is what gets persisted; default is 30 (~one month).
interface RangeOption {
  days: number;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { days: 7,   label: "1 week" },
  { days: 14,  label: "2 weeks" },
  { days: 30,  label: "1 month" },
  { days: 90,  label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

export default function ForageFavoritesSettingsPage() {

  // DATA / INPUT
  const [historyDays, setHistoryDays] = useState<number>(30);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`/modules/forage/api/settings`)
      .then((r) => r.json())
      .then((s: { favorites_history_days?: number }) => {
        if (typeof s.favorites_history_days === "number") setHistoryDays(s.favorites_history_days);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  async function pickRange(next: number) {
    if (next === historyDays || isSaving) return;
    setIsSaving(true);
    const prev = historyDays;
    setHistoryDays(next); // optimistic
    try {
      const res = await fetch(`/modules/forage/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorites_history_days: next }),
      });
      if (!res.ok) {
        setHistoryDays(prev);
        toast.error("Failed to save");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Settings" fallback="/modules/forage/ui/settings" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Favorites</h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* HISTORY RANGE */
          <div>

            {/* SECTION TITLE */}
            <h2 className="settings-section-title">History range</h2>

            {/* RANGE OPTIONS */}
            <SettingsRadioGroup
              options={RANGE_OPTIONS.map((o) => ({ value: String(o.days), label: o.label }))}
              value={String(historyDays)}
              disabled={isSaving}
              onChange={(next) => pickRange(Number(next))}
            />

            {/* GROUP NOTE — explains what the window affects */}
            <p className="settings-group-note">
              The food search shows your frequent foods for the hour you&apos;re logging at, plus the hour
              either side, so a meal that drifts still counts. Only foods logged within this window
              count, so something you ate at this time long ago stops showing up.
            </p>
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
