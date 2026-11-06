"use client";

import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import NumberField from "@/components/ui/NumberField";
import { SettingsToggleRow, SettingsTimeRow, SettingsControlRow } from "@/components/settings/SettingsList";
import { CHECKIN_MINIMUM_MIN, CHECKIN_MINIMUM_MAX, DEFAULT_SETTINGS } from "../../../types/settings";
import { EmailDeliveryStatus } from "@/components/settings/EmailDeliveryStatus";
import Breadcrumbs from "@/components/Breadcrumbs";

export default function ForageCheckinRemindersPage() {

  // INPUT — the user's check-in settings (mirrors the stored settings columns).
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("09:00");
  const [minLoggedDays, setMinLoggedDays] = useState<number | null>(DEFAULT_SETTINGS.checkin_min_logged_days);
  const [minWeighIns, setMinWeighIns] = useState<number | null>(DEFAULT_SETTINGS.checkin_min_weigh_ins);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const isSavingMinimums = useRef(false);
  const hasPendingMinimums = useRef(false);
  const savedMinimums = useRef({ minLoggedDays: DEFAULT_SETTINGS.checkin_min_logged_days, minWeighIns: DEFAULT_SETTINGS.checkin_min_weigh_ins });
  const draftMinimums = useRef<{ minLoggedDays: number | null; minWeighIns: number | null }>({ ...savedMinimums.current });

  useEffect(() => {
    fetch(`/modules/forage/api/settings`)
      .then((r) => r.json())
      .then((s: { checkin_notif_enabled?: boolean; checkin_notif_time?: string; checkin_min_logged_days?: number; checkin_min_weigh_ins?: number }) => {
        if (typeof s.checkin_notif_enabled === "boolean") setEnabled(s.checkin_notif_enabled);
        if (typeof s.checkin_notif_time === "string") setTime(s.checkin_notif_time.slice(0, 5));
        if (typeof s.checkin_min_logged_days === "number" && typeof s.checkin_min_weigh_ins === "number") {
          savedMinimums.current = { minLoggedDays: s.checkin_min_logged_days, minWeighIns: s.checkin_min_weigh_ins };
          draftMinimums.current = { ...savedMinimums.current };
          setMinLoggedDays(s.checkin_min_logged_days);
          setMinWeighIns(s.checkin_min_weigh_ins);
        }
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

  function restoreSavedMinimums() {
    draftMinimums.current = { ...savedMinimums.current };
    setMinLoggedDays(savedMinimums.current.minLoggedDays);
    setMinWeighIns(savedMinimums.current.minWeighIns);
  }

  // Save the drafted minimums when a field is left, one request at a time
  async function saveMinimums() {
    if (isSavingMinimums.current) { // Save again once the request in flight returns
      hasPendingMinimums.current = true;
      return;
    }
    const { minLoggedDays: nextMinLoggedDays, minWeighIns: nextMinWeighIns } = draftMinimums.current; // NOTE: Read from a ref, as NumberField reports the settled value just before its blur handler runs
    const saved = savedMinimums.current;
    if (nextMinLoggedDays === null || nextMinWeighIns === null) return restoreSavedMinimums();
    if (nextMinLoggedDays === saved.minLoggedDays && nextMinWeighIns === saved.minWeighIns) return;
    isSavingMinimums.current = true;
    try {
      const res = await fetch(`/modules/forage/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkin_min_logged_days: nextMinLoggedDays, checkin_min_weigh_ins: nextMinWeighIns }),
      });
      if (!res.ok) throw new Error(`Save failed with status '${res.status}'`);
      savedMinimums.current = { minLoggedDays: nextMinLoggedDays, minWeighIns: nextMinWeighIns };
    } catch {
      restoreSavedMinimums();
      hasPendingMinimums.current = false;
      toast.error("Failed to save");
    } finally {
      isSavingMinimums.current = false;
    }
    if (hasPendingMinimums.current) {
      hasPendingMinimums.current = false;
      await saveMinimums();
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

        {/* BREADCRUMBS */}
        <Breadcrumbs />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Check-in</h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          /* CHECK-IN SETTINGS */
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

            {/* SECTION TITLE */}
            <h2 className="settings-section-title">Minimum data</h2>

            {/* MINIMUMS GROUP */}
            <div className="settings-group">

              {/* MINIMUM LOGGED DAYS */}
              <SettingsControlRow label="Logged days">

                {/* LOGGED DAYS FIELD */}
                <NumberField
                  className="input-field settings-number-input"
                  aria-label="Logged days"
                  min={CHECKIN_MINIMUM_MIN}
                  max={CHECKIN_MINIMUM_MAX}
                  integer
                  value={minLoggedDays}
                  onValueChange={(next) => { draftMinimums.current.minLoggedDays = next; setMinLoggedDays(next); }}
                  onBlur={saveMinimums}
                />
              </SettingsControlRow>

              {/* MINIMUM WEIGH-INS */}
              <SettingsControlRow label="Weigh-ins" divider>

                {/* WEIGH-INS FIELD */}
                <NumberField
                  className="input-field settings-number-input"
                  aria-label="Weigh-ins"
                  min={CHECKIN_MINIMUM_MIN}
                  max={CHECKIN_MINIMUM_MAX}
                  integer
                  value={minWeighIns}
                  onValueChange={(next) => { draftMinimums.current.minWeighIns = next; setMinWeighIns(next); }}
                  onBlur={saveMinimums}
                />
              </SettingsControlRow>
            </div>

            {/* MINIMUMS NOTE */}
            <p className="settings-group-note">
              Targets are kept when the last 7 days fall short of these minimums. 0 turns a minimum off.
            </p>
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
