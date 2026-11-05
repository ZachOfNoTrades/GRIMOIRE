"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Send, Sparkles, GraduationCap, BarChart3 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import NumberField from "@/components/ui/NumberField";
import { SettingsGroup, SettingsToggleRow, SettingsTimeRow } from "@/components/settings/SettingsList";
import { EmailDeliveryStatus } from "@/components/settings/EmailDeliveryStatus";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";
import Breadcrumbs from "@/components/Breadcrumbs";
import { usageHref } from "@/lib/usageChartModules";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import {
  DEFAULT_DIGEST_ENABLED,
  DEFAULT_DIGEST_TIME,
  DEFAULT_AUTO_ADVANCE_ON_EVALUATE,
  DEFAULT_AUTO_ADVANCE_SECONDS,
  DEFAULT_EVALUATION_SOUND_ENABLED,
  MIN_AUTO_ADVANCE_SECONDS,
  MAX_AUTO_ADVANCE_SECONDS,
  DEFAULT_DAILY_GOAL,
  DEFAULT_DAILY_MAX_RENEW,
  MIN_DAILY_TARGET,
  MAX_DAILY_TARGET,
  DEFAULT_HANDS_FREE_SILENCE_SECONDS,
  MIN_HANDS_FREE_SILENCE_SECONDS,
  MAX_HANDS_FREE_SILENCE_SECONDS,
} from "../../types/settings";

function calendarTodayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A RuneSettingsForm is the set of values the Save button writes
interface RuneSettingsForm {
  digestEnabled: boolean;
  digestTime: string;
  evaluationPersonalityPrompt: string;
  autoAdvanceOnEvaluate: boolean;
  autoAdvanceSeconds: number | null;
  evaluationSoundEnabled: boolean;
  dailyGoal: number | null;
  dailyMaxRenew: number | null;
  handsFreeSilenceSeconds: number | null;
}

export default function RuneSettingsPage() {
  const router = useRouter();

  // INPUT
  const [digestEnabled, setDigestEnabled] = useState<boolean>(DEFAULT_DIGEST_ENABLED);
  const [digestTime, setDigestTime] = useState<string>(DEFAULT_DIGEST_TIME);
  const [evaluationPersonalityPrompt, setEvaluationPersonalityPrompt] = useState<string>("");
  const [autoAdvanceOnEvaluate, setAutoAdvanceOnEvaluate] = useState<boolean>(DEFAULT_AUTO_ADVANCE_ON_EVALUATE);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number | null>(DEFAULT_AUTO_ADVANCE_SECONDS);
  const [evaluationSoundEnabled, setEvaluationSoundEnabled] = useState<boolean>(DEFAULT_EVALUATION_SOUND_ENABLED);
  const [dailyGoal, setDailyGoal] = useState<number | null>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number | null>(DEFAULT_DAILY_MAX_RENEW);
  const [handsFreeSilenceSeconds, setHandsFreeSilenceSeconds] = useState<number | null>(DEFAULT_HANDS_FREE_SILENCE_SECONDS);

  // STATE
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [clearingDigest, setClearingDigest] = useState(false);
  const [resettingPersonalityPrompt, setResettingPersonalityPrompt] = useState(false);
  const [digestLastSentDate, setDigestLastSentDate] = useState<string | null>(null);
  const [defaultEvaluationPersonalityPrompt, setDefaultEvaluationPersonalityPrompt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState<RuneSettingsForm | null>(null);

  const digestSentToday = digestLastSentDate === calendarTodayYMD();
  const currentSettings: RuneSettingsForm = {
    digestEnabled,
    digestTime,
    evaluationPersonalityPrompt,
    autoAdvanceOnEvaluate,
    autoAdvanceSeconds,
    evaluationSoundEnabled,
    dailyGoal,
    dailyMaxRenew,
    handsFreeSilenceSeconds,
  };
  const isDirty = savedSettings !== null && JSON.stringify(currentSettings) !== JSON.stringify(savedSettings);

  useUnsavedWarning(isDirty);

  // Show a saved form in the fields and take it as the baseline Save compares against
  function applySavedSettings(settings: RuneSettingsForm) {
    setDigestEnabled(settings.digestEnabled);
    setDigestTime(settings.digestTime);
    setEvaluationPersonalityPrompt(settings.evaluationPersonalityPrompt);
    setAutoAdvanceOnEvaluate(settings.autoAdvanceOnEvaluate);
    setAutoAdvanceSeconds(settings.autoAdvanceSeconds);
    setEvaluationSoundEnabled(settings.evaluationSoundEnabled);
    setDailyGoal(settings.dailyGoal);
    setDailyMaxRenew(settings.dailyMaxRenew);
    setHandsFreeSilenceSeconds(settings.handsFreeSilenceSeconds);
    setSavedSettings(settings);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/modules/rune/api/settings");
        if (!res.ok) {
          throw new Error(`Failed to load settings (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        applySavedSettings({
          digestEnabled: Boolean(data.digestEnabled),
          digestTime:
            typeof data.digestTime === "string" && /^\d{2}:\d{2}$/.test(data.digestTime)
              ? data.digestTime
              : DEFAULT_DIGEST_TIME,
          evaluationPersonalityPrompt: typeof data.evaluationPersonalityPrompt === "string" ? data.evaluationPersonalityPrompt : "",
          autoAdvanceOnEvaluate: Boolean(data.autoAdvanceOnEvaluate),
          autoAdvanceSeconds: Number.isFinite(data.autoAdvanceSeconds) ? data.autoAdvanceSeconds : DEFAULT_AUTO_ADVANCE_SECONDS,
          evaluationSoundEnabled: data.evaluationSoundEnabled !== false,
          dailyGoal: Number.isFinite(data.dailyGoal) ? data.dailyGoal : DEFAULT_DAILY_GOAL,
          dailyMaxRenew: Number.isFinite(data.dailyMaxRenew) ? data.dailyMaxRenew : DEFAULT_DAILY_MAX_RENEW,
          handsFreeSilenceSeconds: Number.isFinite(data.handsFreeSilenceSeconds) ? data.handsFreeSilenceSeconds : DEFAULT_HANDS_FREE_SILENCE_SECONDS,
        });
        setDigestLastSentDate(typeof data.digestLastSentDate === "string" ? data.digestLastSentDate : null);
        setDefaultEvaluationPersonalityPrompt(typeof data.defaultEvaluationPersonalityPrompt === "string" ? data.defaultEvaluationPersonalityPrompt : "");
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    if (saving) return;
    if (!/^\d{2}:\d{2}$/.test(digestTime)) {
      toast.error("Digest time must be HH:MM");
      return;
    }
    // Clamp the auto-advance delay to the accepted range before sending.
    const clampedSeconds = Math.min(
      MAX_AUTO_ADVANCE_SECONDS,
      Math.max(MIN_AUTO_ADVANCE_SECONDS, Math.round(autoAdvanceSeconds ?? 0) || DEFAULT_AUTO_ADVANCE_SECONDS),
    );
    // Clamp the soft daily targets to the accepted range before sending.
    const clampedGoal = Math.min(
      MAX_DAILY_TARGET,
      Math.max(MIN_DAILY_TARGET, Math.round(dailyGoal ?? 0) || DEFAULT_DAILY_GOAL),
    );
    const clampedMaxRenew = Math.min(
      MAX_DAILY_TARGET,
      Math.max(MIN_DAILY_TARGET, Math.round(dailyMaxRenew ?? 0) || DEFAULT_DAILY_MAX_RENEW),
    );
    const clampedSilence = Math.min(
      MAX_HANDS_FREE_SILENCE_SECONDS,
      Math.max(MIN_HANDS_FREE_SILENCE_SECONDS, (handsFreeSilenceSeconds ?? 0) || DEFAULT_HANDS_FREE_SILENCE_SECONDS),
    );
    setSaving(true);
    try {
      const res = await fetch("/modules/rune/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          digestEnabled,
          digestTime,
          evaluationPersonalityPrompt,
          autoAdvanceOnEvaluate,
          autoAdvanceSeconds: clampedSeconds,
          evaluationSoundEnabled,
          dailyGoal: clampedGoal,
          dailyMaxRenew: clampedMaxRenew,
          handsFreeSilenceSeconds: clampedSilence,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to save settings (${res.status})`);
        return;
      }
      applySavedSettings({
        digestEnabled: Boolean(body.digestEnabled),
        digestTime: body.digestTime || DEFAULT_DIGEST_TIME,
        evaluationPersonalityPrompt: typeof body.evaluationPersonalityPrompt === "string" ? body.evaluationPersonalityPrompt : "",
        autoAdvanceOnEvaluate: Boolean(body.autoAdvanceOnEvaluate),
        autoAdvanceSeconds: Number.isFinite(body.autoAdvanceSeconds) ? body.autoAdvanceSeconds : clampedSeconds,
        evaluationSoundEnabled: body.evaluationSoundEnabled !== false,
        dailyGoal: Number.isFinite(body.dailyGoal) ? body.dailyGoal : clampedGoal,
        dailyMaxRenew: Number.isFinite(body.dailyMaxRenew) ? body.dailyMaxRenew : clampedMaxRenew,
        handsFreeSilenceSeconds: Number.isFinite(body.handsFreeSilenceSeconds) ? body.handsFreeSilenceSeconds : clampedSilence,
      });
      setDigestLastSentDate(body.digestLastSentDate ?? null);
      toast.success("Settings saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendDigestNow() {
    if (sendingDigest) return;
    setSendingDigest(true);
    try {
      const res = await fetch("/modules/rune/api/digest", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to send digest (${res.status})`);
        return;
      }
      const due = Number(body?.dueCount ?? 0);
      const news = Number(body?.newCount ?? 0);
      toast.success(`Digest sent (${due} due, ${news} new)`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to send digest");
    } finally {
      setSendingDigest(false);
    }
  }

  async function clearDigestSent() {
    if (clearingDigest) return;
    setClearingDigest(true);
    try {
      const res = await fetch("/modules/rune/api/digest", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to clear digest stamp (${res.status})`);
        return;
      }
      setDigestLastSentDate(null);
      toast.success("Digest sent-stamp cleared");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear digest stamp");
    } finally {
      setClearingDigest(false);
    }
  }

  async function resetEvaluationPersonalityPrompt() {
    if (resettingPersonalityPrompt) return;
    setResettingPersonalityPrompt(true);
    try {
      const res = await fetch("/modules/rune/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ digestEnabled, digestTime, evaluationPersonalityPrompt: "" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to reset personality prompt (${res.status})`);
        return;
      }
      const resetPrompt = typeof body.evaluationPersonalityPrompt === "string" ? body.evaluationPersonalityPrompt : defaultEvaluationPersonalityPrompt;
      setEvaluationPersonalityPrompt(resetPrompt);
      setSavedSettings((prev) => prev && { ...prev, digestEnabled, digestTime, evaluationPersonalityPrompt: resetPrompt }); // Take the digest fields the reset also wrote as saved
      toast.success("Personality prompt reset to default");
    } catch (e) {
      console.error(e);
      toast.error("Failed to reset personality prompt");
    } finally {
      setResettingPersonalityPrompt(false);
    }
  }

  const isDefaultPersonalityPrompt = evaluationPersonalityPrompt === defaultEvaluationPersonalityPrompt;

  if (loading) {

    // LOADING PLACEHOLDER
    return (
      <div className="page-with-bottom-bar">

        {/* PAGE SCROLL */}
        <div className="page-scroll">
        <div className="page-container">
          <p className="text-secondary">Loading settings...</p>
        </div>
        </div>

        {/* SAVE BAR */}
        <SettingsSaveBar onSave={saveSettings} isSaveDisabled isSaving={false} />
      </div>
    );
  }

  return (

    // PAGE
    <div className="page-with-bottom-bar">

      {/* TOAST CONTAINER */}
      <Toaster position="bottom-center" containerStyle={{ bottom: "5rem" }} />

      {/* PAGE SCROLL */}
      <div className="page-scroll">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">
          <Bell className="w-6 h-6" /> Settings
        </h1>

        {/* LOAD ERROR */}
        {error && (
          <div className="alert-error mb-4">{error}</div>
        )}

        {/* AI SECTION */}
        <h2 className="settings-section-title">AI</h2>
        <SettingsGroup rows={[{ icon: BarChart3, label: "Usage", onClick: () => router.push(usageHref("rune")) }]} />

        {/* NOTIFICATIONS SECTION */}
        <h2 className="settings-section-title mt-6">Notifications</h2>
        <div className="settings-group">

          {/* ENABLE TOGGLE */}
          <SettingsToggleRow
            label="Daily review notification"
            hint="Emails you a once-per-day due/new summary"
            checked={digestEnabled}
            onChange={setDigestEnabled}
          />

          {/* SEND TIME */}
          <SettingsTimeRow label="Send time (local)" value={digestTime} onChange={setDigestTime} />
        </div>

        {/* GROUP NOTE */}
        <p className="settings-group-note">
          Emails you a once-per-day summary of cards due for review and new cards waiting, broken
          down by deck. The schedule check ticks once a minute server-side; the digest is sent the
          first time the clock reaches or passes your chosen time and won&apos;t re-send until
          tomorrow. If nothing is due, the email is skipped silently. Every email carries a tracking
          ID and a one-click unsubscribe link.
        </p>

        {/* EMAIL DELIVERY STATUS */}
        <EmailDeliveryStatus />

        {/* STUDY SESSION SECTION */}
        <h2 className="settings-section-title mt-6">
          <GraduationCap className="w-4 h-4" /> Study session
        </h2>
        <div className="settings-group">

          {/* AUTO-ADVANCE TOGGLE */}
          <SettingsToggleRow
            label="Auto-advance after evaluating"
            hint="When an answer is judged Easy, accept it and move to the next card automatically"
            checked={autoAdvanceOnEvaluate}
            onChange={setAutoAdvanceOnEvaluate}
          />

          {/* AUTO-ADVANCE DELAY */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Auto-advance delay (seconds)</span>
            <NumberField
              className="settings-time-input"
              min={MIN_AUTO_ADVANCE_SECONDS}
              max={MAX_AUTO_ADVANCE_SECONDS}
              step={1}
              value={autoAdvanceSeconds}
              disabled={!autoAdvanceOnEvaluate}
              integer
              onValueChange={setAutoAdvanceSeconds}
            />
          </div>

          {/* EVALUATION SOUND TOGGLE */}
          <SettingsToggleRow
            label="Play sound on evaluation"
            hint="A short pleasant chime, pitched to the evaluated rating"
            checked={evaluationSoundEnabled}
            onChange={setEvaluationSoundEnabled}
          />

          {/* HANDS-FREE SILENCE */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Hands-free silence (seconds)</span>
            <NumberField
              className="settings-time-input"
              min={MIN_HANDS_FREE_SILENCE_SECONDS}
              max={MAX_HANDS_FREE_SILENCE_SECONDS}
              step={0.5}
              value={handsFreeSilenceSeconds}
              onValueChange={setHandsFreeSilenceSeconds}
            />
          </div>

          {/* DAILY GOAL */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Daily goal (cards)</span>
            <NumberField
              className="settings-time-input"
              min={MIN_DAILY_TARGET}
              max={MAX_DAILY_TARGET}
              step={1}
              value={dailyGoal}
              integer
              onValueChange={setDailyGoal}
            />
          </div>

          {/* DAILY MAX RENEW */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Daily max renew (cards)</span>
            <NumberField
              className="settings-time-input"
              min={MIN_DAILY_TARGET}
              max={MAX_DAILY_TARGET}
              step={1}
              value={dailyMaxRenew}
              integer
              onValueChange={setDailyMaxRenew}
            />
          </div>
        </div>

        {/* GROUP NOTE */}
        <p className="settings-group-note">
          Auto-advance mirrors hands-free mode for typed or tapped answers, but only for answers
          judged <strong>Easy</strong>: the Easy rating is accepted and the next card loads after
          the delay. Anything less than Easy waits for you to rate it manually. The same delay
          drives the hands-free countdown. <strong>Hands-free silence</strong> is how long you stay
          quiet after answering before hands-free stops recording.
        </p>

        {/* DAILY TARGETS NOTE */}
        <p className="settings-group-note">
          <strong>Daily goal</strong> is a motivational target — study progress toward it is shown
          while reviewing. <strong>Daily max renew</strong> is a soft ceiling: once you pass it for
          the day, the study screen gently warns you, but nothing is ever hidden or blocked — every
          due card stays available. Both count distinct cards reviewed today.
        </p>

        {/* ANSWER EVALUATION SECTION */}
        <h2 className="settings-section-title mt-6">
          <Sparkles className="w-4 h-4" /> Answer evaluation
        </h2>
        <div className="settings-group">

          {/* PERSONALITY PROMPT EDITOR */}
          <div className="flex flex-col gap-1 p-3">
            <label className="text-secondary">Response personality prompt</label>
            <textarea
              value={evaluationPersonalityPrompt}
              onChange={(e) => setEvaluationPersonalityPrompt(e.target.value)}
              rows={8}
              className="input-field w-full font-mono text-xs"
            />
          </div>
        </div>

        {/* GROUP NOTE */}
        <p className="settings-group-note">
          Controls tone and phrasing of the evaluation explanation shown to you.
        </p>

        {/* RESET PERSONALITY PROMPT TO DEFAULT */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Button className="btn-off" onClick={resetEvaluationPersonalityPrompt} disabled={resettingPersonalityPrompt || isDefaultPersonalityPrompt}>
            {resettingPersonalityPrompt ? "Resetting..." : "Reset to default"}
          </Button>
          <span className="text-xs text-secondary">
            {isDefaultPersonalityPrompt ? "Already using the default personality prompt." : "Discards your customization."}
          </span>
        </div>

        {/* MANUAL TRIGGER */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Button className="btn-off" onClick={sendDigestNow} disabled={sendingDigest}>
            <Send className="w-4 h-4" />
            {sendingDigest ? "Sending..." : "Send digest now (debug)"}
          </Button>
          <span className="text-xs text-secondary">
            Bypasses the enabled/time settings and doesn&apos;t affect today&apos;s scheduled send.
          </span>
        </div>

        {/* CLEAR SENT STAMP */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Button className="btn-off" onClick={clearDigestSent} disabled={clearingDigest || !digestSentToday}>
            {clearingDigest ? "Clearing..." : "Clear today's sent stamp (debug)"}
          </Button>
          <span className="text-xs text-secondary">
            {digestSentToday
              ? `Already sent today (${digestLastSentDate}). Clears the stamp so the scheduler re-fires.`
              : "No stamp for today — nothing to clear."}
          </span>
        </div>
      </div>
      </div>

      {/* SAVE BAR */}
      <SettingsSaveBar onSave={saveSettings} isSaveDisabled={!isDirty} isSaving={saving} />
    </div>
  );
}
