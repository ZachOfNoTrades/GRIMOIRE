"use client";

import { useEffect, useState } from "react";
import { Bell, Send, Sparkles, GraduationCap } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { SettingsBackLink, SettingsToggleRow, SettingsTimeRow } from "@/components/settings/SettingsList";
import { EmailDeliveryStatus } from "@/components/settings/EmailDeliveryStatus";
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
} from "../../types/settings";

function calendarTodayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function RuneSettingsPage() {

  // INPUT
  const [digestEnabled, setDigestEnabled] = useState<boolean>(DEFAULT_DIGEST_ENABLED);
  const [digestTime, setDigestTime] = useState<string>(DEFAULT_DIGEST_TIME);
  const [evaluationSystemPrompt, setEvaluationSystemPrompt] = useState<string>("");
  const [evaluationPersonalityPrompt, setEvaluationPersonalityPrompt] = useState<string>("");
  const [autoAdvanceOnEvaluate, setAutoAdvanceOnEvaluate] = useState<boolean>(DEFAULT_AUTO_ADVANCE_ON_EVALUATE);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number>(DEFAULT_AUTO_ADVANCE_SECONDS);
  const [evaluationSoundEnabled, setEvaluationSoundEnabled] = useState<boolean>(DEFAULT_EVALUATION_SOUND_ENABLED);
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number>(DEFAULT_DAILY_MAX_RENEW);

  // STATE
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [clearingDigest, setClearingDigest] = useState(false);
  const [resettingSystemPrompt, setResettingSystemPrompt] = useState(false);
  const [resettingPersonalityPrompt, setResettingPersonalityPrompt] = useState(false);
  const [digestLastSentDate, setDigestLastSentDate] = useState<string | null>(null);
  const [defaultEvaluationSystemPrompt, setDefaultEvaluationSystemPrompt] = useState<string>("");
  const [defaultEvaluationPersonalityPrompt, setDefaultEvaluationPersonalityPrompt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const digestSentToday = digestLastSentDate === calendarTodayYMD();

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
        setDigestEnabled(Boolean(data.digestEnabled));
        setDigestTime(
          typeof data.digestTime === "string" && /^\d{2}:\d{2}$/.test(data.digestTime)
            ? data.digestTime
            : DEFAULT_DIGEST_TIME,
        );
        setDigestLastSentDate(typeof data.digestLastSentDate === "string" ? data.digestLastSentDate : null);
        setEvaluationSystemPrompt(typeof data.evaluationSystemPrompt === "string" ? data.evaluationSystemPrompt : "");
        setEvaluationPersonalityPrompt(typeof data.evaluationPersonalityPrompt === "string" ? data.evaluationPersonalityPrompt : "");
        setAutoAdvanceOnEvaluate(Boolean(data.autoAdvanceOnEvaluate));
        setAutoAdvanceSeconds(Number.isFinite(data.autoAdvanceSeconds) ? data.autoAdvanceSeconds : DEFAULT_AUTO_ADVANCE_SECONDS);
        setEvaluationSoundEnabled(data.evaluationSoundEnabled !== false);
        setDailyGoal(Number.isFinite(data.dailyGoal) ? data.dailyGoal : DEFAULT_DAILY_GOAL);
        setDailyMaxRenew(Number.isFinite(data.dailyMaxRenew) ? data.dailyMaxRenew : DEFAULT_DAILY_MAX_RENEW);
        setDefaultEvaluationSystemPrompt(typeof data.defaultEvaluationSystemPrompt === "string" ? data.defaultEvaluationSystemPrompt : "");
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
      Math.max(MIN_AUTO_ADVANCE_SECONDS, Math.round(autoAdvanceSeconds) || DEFAULT_AUTO_ADVANCE_SECONDS),
    );
    // Clamp the soft daily targets to the accepted range before sending.
    const clampedGoal = Math.min(
      MAX_DAILY_TARGET,
      Math.max(MIN_DAILY_TARGET, Math.round(dailyGoal) || DEFAULT_DAILY_GOAL),
    );
    const clampedMaxRenew = Math.min(
      MAX_DAILY_TARGET,
      Math.max(MIN_DAILY_TARGET, Math.round(dailyMaxRenew) || DEFAULT_DAILY_MAX_RENEW),
    );
    setSaving(true);
    try {
      const res = await fetch("/modules/rune/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          digestEnabled,
          digestTime,
          evaluationSystemPrompt,
          evaluationPersonalityPrompt,
          autoAdvanceOnEvaluate,
          autoAdvanceSeconds: clampedSeconds,
          evaluationSoundEnabled,
          dailyGoal: clampedGoal,
          dailyMaxRenew: clampedMaxRenew,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to save settings (${res.status})`);
        return;
      }
      setDigestEnabled(Boolean(body.digestEnabled));
      setDigestTime(body.digestTime || DEFAULT_DIGEST_TIME);
      setDigestLastSentDate(body.digestLastSentDate ?? null);
      setEvaluationSystemPrompt(typeof body.evaluationSystemPrompt === "string" ? body.evaluationSystemPrompt : "");
      setEvaluationPersonalityPrompt(typeof body.evaluationPersonalityPrompt === "string" ? body.evaluationPersonalityPrompt : "");
      setAutoAdvanceOnEvaluate(Boolean(body.autoAdvanceOnEvaluate));
      setAutoAdvanceSeconds(Number.isFinite(body.autoAdvanceSeconds) ? body.autoAdvanceSeconds : clampedSeconds);
      setEvaluationSoundEnabled(body.evaluationSoundEnabled !== false);
      setDailyGoal(Number.isFinite(body.dailyGoal) ? body.dailyGoal : clampedGoal);
      setDailyMaxRenew(Number.isFinite(body.dailyMaxRenew) ? body.dailyMaxRenew : clampedMaxRenew);
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

  async function resetEvaluationSystemPrompt() {
    if (resettingSystemPrompt) return;
    setResettingSystemPrompt(true);
    try {
      const res = await fetch("/modules/rune/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ digestEnabled, digestTime, evaluationSystemPrompt: "" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to reset system prompt (${res.status})`);
        return;
      }
      setEvaluationSystemPrompt(typeof body.evaluationSystemPrompt === "string" ? body.evaluationSystemPrompt : defaultEvaluationSystemPrompt);
      toast.success("System prompt reset to default");
    } catch (e) {
      console.error(e);
      toast.error("Failed to reset system prompt");
    } finally {
      setResettingSystemPrompt(false);
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
      setEvaluationPersonalityPrompt(typeof body.evaluationPersonalityPrompt === "string" ? body.evaluationPersonalityPrompt : defaultEvaluationPersonalityPrompt);
      toast.success("Personality prompt reset to default");
    } catch (e) {
      console.error(e);
      toast.error("Failed to reset personality prompt");
    } finally {
      setResettingPersonalityPrompt(false);
    }
  }

  const isDefaultSystemPrompt = evaluationSystemPrompt === defaultEvaluationSystemPrompt;
  const isDefaultPersonalityPrompt = evaluationPersonalityPrompt === defaultEvaluationPersonalityPrompt;

  if (loading) {

    // LOADING PLACEHOLDER
    return (
      <div className="page">
        <div className="page-container">
          <p className="text-secondary">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (

    // PAGE
    <div className="page">

      {/* TOAST CONTAINER */}
      <Toaster position="bottom-right" />

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Home" fallback="/modules/rune/ui/home" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">
          <Bell className="w-6 h-6" /> Settings
        </h1>

        {/* LOAD ERROR */}
        {error && (
          <div className="alert-error mb-4">{error}</div>
        )}

        {/* NOTIFICATIONS SECTION */}
        <h2 className="settings-section-title">Notifications</h2>
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
            <input
              type="number"
              className="settings-time-input"
              min={MIN_AUTO_ADVANCE_SECONDS}
              max={MAX_AUTO_ADVANCE_SECONDS}
              step={1}
              value={autoAdvanceSeconds}
              disabled={!autoAdvanceOnEvaluate}
              onChange={(e) => setAutoAdvanceSeconds(Number(e.target.value))}
            />
          </div>

          {/* EVALUATION SOUND TOGGLE */}
          <SettingsToggleRow
            label="Play sound on evaluation"
            hint="A short pleasant chime, pitched to the evaluated rating"
            checked={evaluationSoundEnabled}
            onChange={setEvaluationSoundEnabled}
          />

          {/* DAILY GOAL */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Daily goal (cards)</span>
            <input
              type="number"
              className="settings-time-input"
              min={MIN_DAILY_TARGET}
              max={MAX_DAILY_TARGET}
              step={1}
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
            />
          </div>

          {/* DAILY MAX RENEW */}
          <div className="settings-time-row" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="settings-time-label">Daily max renew (cards)</span>
            <input
              type="number"
              className="settings-time-input"
              min={MIN_DAILY_TARGET}
              max={MAX_DAILY_TARGET}
              step={1}
              value={dailyMaxRenew}
              onChange={(e) => setDailyMaxRenew(Number(e.target.value))}
            />
          </div>
        </div>

        {/* GROUP NOTE */}
        <p className="settings-group-note">
          Auto-advance mirrors hands-free mode for typed or tapped answers, but only for answers
          judged <strong>Easy</strong>: the Easy rating is accepted and the next card loads after
          the delay. Anything less than Easy waits for you to rate it manually. The same delay
          drives the hands-free countdown. Remember to Save.
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

          {/* SYSTEM PROMPT EDITOR */}
          <div className="flex flex-col gap-1 p-3">
            <label className="text-secondary">System prompt</label>
            <textarea
              value={evaluationSystemPrompt}
              onChange={(e) => setEvaluationSystemPrompt(e.target.value)}
              rows={14}
              className="input-field w-full font-mono text-xs"
            />
          </div>
        </div>

        {/* GROUP NOTE */}
        <p className="settings-group-note">
          The task rules given to the model that judges your spoken/typed answers — what counts
          as correct, the canned responses for garbled/unrelated/empty answers, and the JSON
          output format. Supports the placeholders <code className="code-inline">{"{{QUESTION}}"}</code>,{" "}
          <code className="code-inline">{"{{EXPECTED_ANSWER}}"}</code>,{" "}
          <code className="code-inline">{"{{NOTES}}"}</code>, and{" "}
          <code className="code-inline">{"{{USER_ANSWER}}"}</code>.
        </p>

        {/* RESET SYSTEM PROMPT TO DEFAULT */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Button className="btn-off" onClick={resetEvaluationSystemPrompt} disabled={resettingSystemPrompt || isDefaultSystemPrompt}>
            {resettingSystemPrompt ? "Resetting..." : "Reset to default"}
          </Button>
          <span className="text-xs text-secondary">
            {isDefaultSystemPrompt ? "Already using the default system prompt." : "Discards your customization."}
          </span>
        </div>

        {/* PERSONALITY PROMPT SECTION */}
        <div className="settings-group mt-4">

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
          Controls tone and phrasing of the evaluation explanation shown to you — separate from
          the task rules above.
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

        {/* SAVE */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <Button className="btn-blue" onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
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
  );
}
