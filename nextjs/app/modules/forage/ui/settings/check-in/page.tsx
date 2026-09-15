"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { SettingsBackLink, SettingsToggleRow, SettingsTimeRow } from "@/components/settings/SettingsList";
import { EmailDeliveryStatus } from "@/components/settings/EmailDeliveryStatus";

export default function ForageCheckinRemindersPage() {

  // INPUT — the user's reminder preference (mirrors the stored settings columns).
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("09:00");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetch(`/modules/forage/api/settings`)
      .then((r) => r.json())
      .then((s: { checkin_notif_enabled?: boolean; checkin_notif_time?: string }) => {
        if (typeof s.checkin_notif_enabled === "boolean") setEnabled(s.checkin_notif_enabled);
        if (typeof s.checkin_notif_time === "string") setTime(s.checkin_notif_time.slice(0, 5));
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
        body: JSON.stringify({ checkin_notif_enabled: nextEnabled, checkin_notif_time: nextTime }),
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

  async function sendTest() {
    if (isTesting) return;
    setIsTesting(true);
    try {
      const res = await fetch(`/modules/forage/api/settings/check-in/test`, { method: "POST" });
      if (res.ok) {
        toast.success("Test reminder sent");
      } else {
        // The server knows exactly why (no Gmail connected, revoked grant, send rejected) and
        // each of those needs a different fix, so show its reason instead of one blanket line.
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Couldn't send test reminder");
      }
    } catch {
      toast.error("Couldn't send test reminder");
    } finally {
      setIsTesting(false);
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
        <h1 className="text-page-title settings-title">Check-in reminders</h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* REMINDER SETTINGS */
          <div>

            {/* TOGGLE + TIME GROUP */}
            <div className="settings-group">

              {/* ENABLE TOGGLE */}
              <SettingsToggleRow
                label="Weekly check-in reminder"
                hint="Get an email nudge on your check-in day"
                checked={enabled}
                disabled={isSaving}
                onChange={(next) => save(next, time)}
              />

              {enabled && (
                /* REMINDER TIME */
                <SettingsTimeRow
                  label="Reminder time"
                  value={time}
                  disabled={isSaving}
                  onChange={(next) => save(enabled, next)}
                />
              )}
            </div>

            {/* GROUP NOTE */}
            <p className="settings-group-note">
              Reminders only fire for a coached program, on the program&apos;s check-in weekday, and stop
              once you complete the check-in wizard from the Strategy tab (tap the ring, or the dashboard
              banner, once it&apos;s due).
            </p>

            {/* EMAIL DELIVERY STATUS */}
            <EmailDeliveryStatus />

            {/* TEST BUTTON */}
            <div style={{ marginTop: "1.25rem" }}>
              <Button
                className="btn-blue"
                onClick={sendTest}
                disabled={isTesting}
              >
                {isTesting ? "Sending…" : "Send a test reminder"}
              </Button>
            </div>
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
