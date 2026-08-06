"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { SettingsBackLink, SettingsToggleRow, SettingsTimeRow } from "@/components/settings/SettingsList";

export default function ForageHomeBadgePage() {

  // INPUT — the user's badge preference (mirrors the stored settings columns).
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState("12:00");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`/modules/forage/api/settings`)
      .then((r) => r.json())
      .then((s: { unlogged_badge_enabled?: boolean; unlogged_badge_time?: string }) => {
        if (typeof s.unlogged_badge_enabled === "boolean") setEnabled(s.unlogged_badge_enabled);
        if (typeof s.unlogged_badge_time === "string") setTime(s.unlogged_badge_time.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Persist the current enabled+time pair. Optimistic with rollback on failure.
  async function save(nextEnabled: boolean, nextTime: string) {
    if (isSaving) return;
    setIsSaving(true);
    const prevEnabled = enabled;
    const prevTime = time;
    setEnabled(nextEnabled);
    setTime(nextTime);
    try {
      const res = await fetch(`/modules/forage/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unlogged_badge_enabled: nextEnabled, unlogged_badge_time: nextTime }),
      });
      if (!res.ok) {
        setEnabled(prevEnabled);
        setTime(prevTime);
        toast.error("Failed to save");
      }
    } catch {
      setEnabled(prevEnabled);
      setTime(prevTime);
      toast.error("Failed to save");
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
        <h1 className="text-page-title settings-title">Home badge</h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* BADGE SETTINGS */
          <div>

            {/* TOGGLE + TIME GROUP */}
            <div className="settings-group">

              {/* ENABLE TOGGLE */}
              <SettingsToggleRow
                label="Unlogged-day badge"
                hint="Flag the Forage card when nothing has been logged yet"
                checked={enabled}
                disabled={isSaving}
                onChange={(next) => save(next, time)}
              />

              {enabled && (
                /* CUTOFF TIME */
                <SettingsTimeRow
                  label="Flag after"
                  value={time}
                  disabled={isSaving}
                  onChange={(next) => save(enabled, next)}
                />
              )}
            </div>

            {/* GROUP NOTE */}
            <p className="settings-group-note">
              Once this time passes with an empty food diary, the Forage card on the Grimoire home
              page shows a &quot;Nothing logged&quot; badge. It disappears as soon as you log
              anything today. No notification is sent — the badge only shows on the home page.
            </p>
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
