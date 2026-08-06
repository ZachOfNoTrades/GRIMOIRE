"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Coins, Heart, History, Flame, Repeat, Skull, Sparkles, Bell, Send, CalendarClock, Trophy, Quote, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { SettingsBackLink, SettingsToggleRow, SettingsTimeRow } from "@/components/settings/SettingsList";
import { Difficulty, DIFFICULTY_ORDER } from "../../types/task";
import {
  DEFAULT_FACTORS,
  DEFAULT_DAMAGE_FACTOR,
  DEFAULT_COIN_DAMAGE,
  DEFAULT_HEALTH_DAMAGE,
  DEFAULT_STREAK_FACTOR,
  DEFAULT_STREAK_CAP,
  DEFAULT_NEGLECT_FACTOR,
  DEFAULT_NEGLECT_CAP,
  DEFAULT_DAILY_REWARD_FORMULA,
  DEFAULT_TODO_REWARD_FORMULA,
  DEFAULT_DAMAGE_FORMULA,
  DEFAULT_TODO_BONUS_ENABLED,
  DEFAULT_TODO_BONUS_DAILY_CHANCE,
  DEFAULT_TODO_BONUS_MULTIPLIER,
  DEFAULT_TODO_BONUS_AGE_BIAS,
  DEFAULT_DIGEST_ENABLED,
  DEFAULT_DIGEST_TIME,
  DEFAULT_BONUS_NOTIF_ENABLED,
  DEFAULT_BONUS_NOTIF_TIME,
  DEFAULT_BONUS_NOTIF_ALWAYS,
  DEFAULT_REMINDERS_ENABLED,
  DEFAULT_RETRO_COMPLETION_ENABLED,
  DEFAULT_RETRO_COMPLETION_MULTIPLIER,
  DEFAULT_RETRO_LOOKBACK_DAYS,
  DEFAULT_ALL_DAILIES_BONUS_ENABLED,
  DEFAULT_ALL_DAILIES_BONUS_AMOUNT,
  QuestFactors,
  DifficultyMap,
} from "../../types/settings";
import { Mantra, MANTRA_MAX_LENGTH } from "../../types/mantra";
import { validateFormula } from "../../lib/formulaEvaluator";

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  ts_created: string;
}

interface TodoSummary {
  id: string;
  title: string;
  ts_created: string;
}

const DIFF_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  max: "Max",
};

type StringMap = Record<Difficulty, string>;
const blankStringMap = (src: DifficultyMap): StringMap => ({
  easy: String(src.easy),
  medium: String(src.medium),
  hard: String(src.hard),
  max: String(src.max),
});

export default function QuestSettingsPage() {
  const router = useRouter();

  // DATA
  const [balance, setBalance] = useState<number>(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [todos, setTodos] = useState<TodoSummary[]>([]);
  const [forcedTodoId, setForcedTodoId] = useState<string | null>(null);
  const [mantras, setMantras] = useState<Mantra[]>([]);

  // INPUT
  const [factorInputs, setFactorInputs] = useState<StringMap>(blankStringMap(DEFAULT_FACTORS));
  const [coinDamageInputs, setCoinDamageInputs] = useState<StringMap>(blankStringMap(DEFAULT_COIN_DAMAGE));
  const [healthDamageInputs, setHealthDamageInputs] = useState<StringMap>(blankStringMap(DEFAULT_HEALTH_DAMAGE));
  const [damageFactor, setDamageFactor] = useState<string>(String(DEFAULT_DAMAGE_FACTOR));
  const [streakFactorInput, setStreakFactorInput] = useState<string>(String(DEFAULT_STREAK_FACTOR));
  const [streakCapInput, setStreakCapInput] = useState<string>(String(DEFAULT_STREAK_CAP));
  const [neglectFactorInput, setNeglectFactorInput] = useState<string>(String(DEFAULT_NEGLECT_FACTOR));
  const [neglectCapInput, setNeglectCapInput] = useState<string>(String(DEFAULT_NEGLECT_CAP));
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [dailyRewardFormulaInput, setDailyRewardFormulaInput] = useState<string>(DEFAULT_DAILY_REWARD_FORMULA);
  const [todoRewardFormulaInput, setTodoRewardFormulaInput] = useState<string>(DEFAULT_TODO_REWARD_FORMULA);
  const [damageFormulaInput, setDamageFormulaInput] = useState<string>(DEFAULT_DAMAGE_FORMULA);
  const [todoBonusEnabled, setTodoBonusEnabled] = useState<boolean>(DEFAULT_TODO_BONUS_ENABLED);
  const [todoBonusDailyChanceInput, setTodoBonusDailyChanceInput] = useState<string>(String(DEFAULT_TODO_BONUS_DAILY_CHANCE));
  const [todoBonusMultiplierInput, setTodoBonusMultiplierInput] = useState<string>(String(DEFAULT_TODO_BONUS_MULTIPLIER));
  const [todoBonusAgeBiasInput, setTodoBonusAgeBiasInput] = useState<string>(String(DEFAULT_TODO_BONUS_AGE_BIAS));
  const [digestEnabled, setDigestEnabled] = useState<boolean>(DEFAULT_DIGEST_ENABLED);
  const [digestTime, setDigestTime] = useState<string>(DEFAULT_DIGEST_TIME);
  const [bonusNotifEnabled, setBonusNotifEnabled] = useState<boolean>(DEFAULT_BONUS_NOTIF_ENABLED);
  const [bonusNotifTime, setBonusNotifTime] = useState<string>(DEFAULT_BONUS_NOTIF_TIME);
  const [bonusNotifAlways, setBonusNotifAlways] = useState<boolean>(DEFAULT_BONUS_NOTIF_ALWAYS);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(DEFAULT_REMINDERS_ENABLED);
  const [retroCompletionEnabled, setRetroCompletionEnabled] = useState<boolean>(DEFAULT_RETRO_COMPLETION_ENABLED);
  // Deduction is edited as a whole-number percent of normal coins (50 ⇒ multiplier 0.5).
  const [retroDeductionInput, setRetroDeductionInput] = useState<string>(String(Math.round(DEFAULT_RETRO_COMPLETION_MULTIPLIER * 100)));
  const [retroLookbackInput, setRetroLookbackInput] = useState<string>(String(DEFAULT_RETRO_LOOKBACK_DAYS));
  const [allDailiesBonusEnabled, setAllDailiesBonusEnabled] = useState<boolean>(DEFAULT_ALL_DAILIES_BONUS_ENABLED);
  const [allDailiesBonusAmountInput, setAllDailiesBonusAmountInput] = useState<string>(String(DEFAULT_ALL_DAILIES_BONUS_AMOUNT));
  // Mantras are saved by their own endpoints the moment you add/edit/delete one, so they are
  // deliberately NOT part of `fingerprint()` / the "Save Settings" button.
  const [newMantraInput, setNewMantraInput] = useState<string>("");
  const [editingMantraText, setEditingMantraText] = useState<string>("");
  const [simulationDate, setSimulationDate] = useState<string>("");
  const [health, setHealth] = useState<string>("50");
  const [maxHealth, setMaxHealth] = useState<string>("50");
  const [coins, setCoins] = useState<string>("0");
  // STATE
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingReview, setClearingReview] = useState(false);
  const [clearReviewConfirmOpen, setClearReviewConfirmOpen] = useState(false);
  const [forceDraftId, setForceDraftId] = useState<string>("");
  const [editingMantraId, setEditingMantraId] = useState<string | null>(null);
  const [sendingDigest, setSendingDigest] = useState<boolean>(false);
  const [sendingBonusNotif, setSendingBonusNotif] = useState<boolean>(false);
  const [clearingDigest, setClearingDigest] = useState<boolean>(false);
  const [clearingBonusNotif, setClearingBonusNotif] = useState<boolean>(false);
  const [digestLastSentDate, setDigestLastSentDate] = useState<string | null>(null);
  const [bonusNotifLastSentDate, setBonusNotifLastSentDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discardConfirmHref, setDiscardConfirmHref] = useState<string | null>(null);
  // Dirty check: compare the *raw input strings* against a pristine snapshot captured at load
  // time. By comparing the exact strings React is rendering — never round-tripping through
  // Number() — there is zero chance of a focus/blur producing a phantom dirty state.
  const pristineRef = useRef<string | null>(null);
  const fingerprint = (): string => JSON.stringify({
    f: factorInputs,
    cd: coinDamageInputs,
    hd: healthDamageInputs,
    df: damageFactor,
    sf: streakFactorInput,
    sc: streakCapInput,
    nf: neglectFactorInput,
    nc: neglectCapInput,
    am: advancedMode,
    drf: dailyRewardFormulaInput,
    trf: todoRewardFormulaInput,
    dmf: damageFormulaInput,
    tbe: todoBonusEnabled,
    tbdc: todoBonusDailyChanceInput,
    tbm: todoBonusMultiplierInput,
    tbab: todoBonusAgeBiasInput,
    de: digestEnabled,
    dt: digestTime,
    bne: bonusNotifEnabled,
    bnt: bonusNotifTime,
    bnoib: bonusNotifAlways,
    re: remindersEnabled,
    rce: retroCompletionEnabled,
    rdp: retroDeductionInput,
    rlb: retroLookbackInput,
    adbe: allDailiesBonusEnabled,
    adba: allDailiesBonusAmountInput,
    fid: forceDraftId,
    sd: simulationDate,
    h: health,
    mh: maxHealth,
    c: coins,
  });
  const isDirty = !loading && pristineRef.current !== null && fingerprint() !== pristineRef.current;

  useEffect(() => {
    (async () => {
      try {
        const [setRes, stRes, bRes, tRes, fRes, mRes] = await Promise.all([
          fetch("/modules/quest/api/settings"),
          fetch("/modules/quest/api/state"),
          fetch("/modules/quest/api/balance"),
          fetch("/modules/quest/api/tasks"),
          fetch("/modules/quest/api/debug/force-bonus"),
          fetch("/modules/quest/api/mantras"),
        ]);
        if (setRes.ok) {
          const data = await setRes.json();
          setFactorInputs(blankStringMap(data.factors));
          setCoinDamageInputs(blankStringMap(data.coinDamage ?? DEFAULT_COIN_DAMAGE));
          setHealthDamageInputs(blankStringMap(data.healthDamage ?? DEFAULT_HEALTH_DAMAGE));
          setDamageFactor(String(data.damageFactor ?? DEFAULT_DAMAGE_FACTOR));
          setStreakFactorInput(String(data.streakFactor ?? DEFAULT_STREAK_FACTOR));
          setStreakCapInput(String(data.streakCap ?? DEFAULT_STREAK_CAP));
          setNeglectFactorInput(String(data.neglectFactor ?? DEFAULT_NEGLECT_FACTOR));
          setNeglectCapInput(String(data.neglectCap ?? DEFAULT_NEGLECT_CAP));
          setAdvancedMode(Boolean(data.advancedMode));
          setDailyRewardFormulaInput(typeof data.dailyRewardFormula === "string" && data.dailyRewardFormula ? data.dailyRewardFormula : DEFAULT_DAILY_REWARD_FORMULA);
          setTodoRewardFormulaInput(typeof data.todoRewardFormula === "string" && data.todoRewardFormula ? data.todoRewardFormula : DEFAULT_TODO_REWARD_FORMULA);
          setDamageFormulaInput(typeof data.damageFormula === "string" && data.damageFormula ? data.damageFormula : DEFAULT_DAMAGE_FORMULA);
          setTodoBonusEnabled(Boolean(data.todoBonusEnabled));
          setTodoBonusDailyChanceInput(String(data.todoBonusDailyChance ?? DEFAULT_TODO_BONUS_DAILY_CHANCE));
          setTodoBonusMultiplierInput(String(data.todoBonusMultiplier ?? DEFAULT_TODO_BONUS_MULTIPLIER));
          setTodoBonusAgeBiasInput(String(data.todoBonusAgeBias ?? DEFAULT_TODO_BONUS_AGE_BIAS));
          setDigestEnabled(Boolean(data.digestEnabled));
          setDigestTime(typeof data.digestTime === "string" && /^\d{2}:\d{2}$/.test(data.digestTime) ? data.digestTime : DEFAULT_DIGEST_TIME);
          setDigestLastSentDate(typeof data.digestLastSentDate === "string" ? data.digestLastSentDate : null);
          setBonusNotifEnabled(Boolean(data.bonusNotifEnabled));
          setBonusNotifTime(typeof data.bonusNotifTime === "string" && /^\d{2}:\d{2}$/.test(data.bonusNotifTime) ? data.bonusNotifTime : DEFAULT_BONUS_NOTIF_TIME);
          setBonusNotifLastSentDate(typeof data.bonusNotifLastSentDate === "string" ? data.bonusNotifLastSentDate : null);
          setBonusNotifAlways(Boolean(data.bonusNotifAlways));
          setRemindersEnabled(Boolean(data.remindersEnabled ?? DEFAULT_REMINDERS_ENABLED));
          setRetroCompletionEnabled(Boolean(data.retroCompletionEnabled ?? DEFAULT_RETRO_COMPLETION_ENABLED));
          setRetroDeductionInput(String(Math.round(Number(data.retroCompletionMultiplier ?? DEFAULT_RETRO_COMPLETION_MULTIPLIER) * 100)));
          setRetroLookbackInput(String(data.retroLookbackDays ?? DEFAULT_RETRO_LOOKBACK_DAYS));
          setAllDailiesBonusEnabled(Boolean(data.allDailiesBonusEnabled ?? DEFAULT_ALL_DAILIES_BONUS_ENABLED));
          setAllDailiesBonusAmountInput(String(data.allDailiesBonusAmount ?? DEFAULT_ALL_DAILIES_BONUS_AMOUNT));
          setSimulationDate(data.simulationDate ?? "");
        } else {
          setError("Failed to load settings");
        }
        if (stRes.ok) {
          const data = await stRes.json();
          setHealth(String(data.state.health));
          setMaxHealth(String(data.state.max_health));
        }
        if (bRes.ok) {
          const data = await bRes.json();
          setBalance(data.balance);
          setCoins(String(data.balance));
          setLedger(data.ledger ?? []);
        }
        if (tRes.ok) {
          const tasks = await tRes.json();
          const todoList: TodoSummary[] = tasks
            .filter((t: { kind: string }) => t.kind === "todo")
            .map((t: { id: string; title: string; ts_created: string }) => ({
              id: t.id,
              title: t.title,
              ts_created: t.ts_created,
            }));
          setTodos(todoList);
        }
        if (fRes.ok) {
          const data = await fRes.json();
          const id = typeof data.forcedTodoBonusId === "string" ? data.forcedTodoBonusId : null;
          setForcedTodoId(id);
          setForceDraftId(id ?? "");
        }
        if (mRes.ok) {
          setMantras(await mRes.json());
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Capture / refresh the pristine snapshot from live state (not a stale closure). Triggered by
  // `pristineDirty` going true: initial load sets it true, save sets it true. The effect snapshots
  // the *rendered* state on the next commit, then clears the flag.
  const [pristineDirty, setPristineDirty] = useState<boolean>(true);
  useEffect(() => {
    if (loading || !pristineDirty) return;
    pristineRef.current = fingerprint();
    setPristineDirty(false);
    // snapshotInputs reads every input; we deliberately omit it from deps and run only when the
    // flag is set after a load / save commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pristineDirty]);

  // Warn on browser-level navigation (close tab, reload, external link) when dirty.
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function attemptNavigate(href: string) {
    if (isDirty) {
      setDiscardConfirmHref(href);
    } else {
      router.push(href);
    }
  }

  // A row still waiting on its POST carries a temporary id, so edit/delete have nothing real to
  // address yet. Those buttons stay inert for the moment the request is in flight.
  const isPendingMantra = (mantraId: string) => mantraId.startsWith("tmp-");

  // Adds a mantra optimistically: the row paints immediately under a temporary id and the POST
  // swaps in the server row (or rolls the row back out if it fails).
  async function addMantra() {
    const text = newMantraInput.trim();
    if (!text) return;
    if (text.length > MANTRA_MAX_LENGTH) {
      toast.error(`Mantra must be ${MANTRA_MAX_LENGTH} characters or fewer`);
      return;
    }
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Mantra = { id: tempId, user_id: "", text, ts_created: new Date() };
    setMantras((prev) => [...prev, optimistic]);
    setNewMantraInput("");
    try {
      const res = await fetch("/modules/quest/api/mantras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add mantra");
      const saved: Mantra = await res.json();
      setMantras((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
    } catch (e) {
      setMantras((prev) => prev.filter((m) => m.id !== tempId));
      setNewMantraInput(text);
      toast.error(e instanceof Error ? e.message : "Failed to add mantra");
    }
  }

  function startEditMantra(mantra: Mantra) {
    setEditingMantraId(mantra.id);
    setEditingMantraText(mantra.text);
  }

  function cancelEditMantra() {
    setEditingMantraId(null);
    setEditingMantraText("");
  }

  async function saveMantraEdit(mantraId: string) {
    const text = editingMantraText.trim();
    if (!text) return;
    if (text.length > MANTRA_MAX_LENGTH) {
      toast.error(`Mantra must be ${MANTRA_MAX_LENGTH} characters or fewer`);
      return;
    }
    const previous = mantras;
    setMantras((prev) => prev.map((m) => (m.id === mantraId ? { ...m, text } : m)));
    cancelEditMantra();
    try {
      const res = await fetch(`/modules/quest/api/mantras/${mantraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update mantra");
    } catch (e) {
      setMantras(previous);
      toast.error(e instanceof Error ? e.message : "Failed to update mantra");
    }
  }

  async function removeMantra(mantraId: string) {
    const previous = mantras;
    setMantras((prev) => prev.filter((m) => m.id !== mantraId));
    if (editingMantraId === mantraId) cancelEditMantra();
    try {
      const res = await fetch(`/modules/quest/api/mantras/${mantraId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete mantra");
    } catch {
      setMantras(previous);
      toast.error("Failed to delete mantra");
    }
  }

  function parseMap(label: string, inputs: StringMap): DifficultyMap | null {
    const out: Partial<DifficultyMap> = {};
    for (const d of DIFFICULTY_ORDER) {
      const n = Number(inputs[d]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`${label} for ${DIFF_LABELS[d]} must be a non-negative number`);
        return null;
      }
      out[d] = n;
    }
    return out as DifficultyMap;
  }

  // The server's effective "today" for this user — simulationDate when set, otherwise the local
  // calendar date. Used to render the "sent today?" badge against last-sent stamps.
  function effectiveToday(): string {
    if (simulationDate) return simulationDate;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const digestSentToday = digestLastSentDate === effectiveToday();
  const bonusNotifSentToday = bonusNotifLastSentDate === effectiveToday();

  async function clearDigestSent() {
    if (clearingDigest) return;
    setClearingDigest(true);
    try {
      const res = await fetch("/modules/quest/api/digest", { method: "DELETE" });
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

  async function clearBonusNotifSent() {
    if (clearingBonusNotif) return;
    setClearingBonusNotif(true);
    try {
      const res = await fetch("/modules/quest/api/bonus-notif", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to clear bonus-notif stamp (${res.status})`);
        return;
      }
      setBonusNotifLastSentDate(null);
      toast.success("Bonus-notif sent-stamp cleared");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear bonus-notif stamp");
    } finally {
      setClearingBonusNotif(false);
    }
  }

  async function sendBonusNotifNow() {
    if (sendingBonusNotif) return;
    setSendingBonusNotif(true);
    try {
      const res = await fetch("/modules/quest/api/bonus-notif", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to send bonus notification (${res.status})`);
        return;
      }
      toast.success(body?.hadBonus ? "Bonus notification sent" : "Bonus notification sent (no bonus today)");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send bonus notification");
    } finally {
      setSendingBonusNotif(false);
    }
  }

  async function sendDigestNow() {
    if (sendingDigest) return;
    setSendingDigest(true);
    try {
      const res = await fetch("/modules/quest/api/digest", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Failed to send digest (${res.status})`);
        return;
      }
      toast.success("Digest sent");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send digest");
    } finally {
      setSendingDigest(false);
    }
  }

  async function clearTodayReview() {
    if (clearingReview) return;
    setClearReviewConfirmOpen(false);
    setClearingReview(true);
    try {
      const res = await fetch("/modules/quest/api/state/clear-review", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Failed to clear review");
        return;
      }
      const data = await res.json();
      const parts = [`${data.reversedTaskCount} task(s)`];
      if (data.reversedCoins) parts.push(`${data.reversedCoins > 0 ? '-' : '+'}${Math.abs(data.reversedCoins)} coin(s)`);
      if (data.restoredHealth) parts.push(`+${data.restoredHealth} HP`);
      if (data.unfrozenDate) parts.push(`unfroze ${data.unfrozenDate}`);
      toast.success(`Cleared review: ${parts.join(', ')}`);
      // Re-load state + balance so the local UI matches what's in the DB
      try {
        const [stRes, bRes] = await Promise.all([
          fetch("/modules/quest/api/state"),
          fetch("/modules/quest/api/balance"),
        ]);
        if (stRes.ok) {
          const st = await stRes.json();
          if (st.state) {
            setHealth(String(st.state.health));
            setMaxHealth(String(st.state.max_health));
          }
        }
        if (bRes.ok) {
          const b = await bRes.json();
          setBalance(Number(b.balance ?? 0));
          setCoins(String(b.balance ?? 0));
          if (Array.isArray(b.ledger)) setLedger(b.ledger);
        }
      } catch {
        // non-fatal — UI just stays stale until the user refreshes
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear review");
    } finally {
      setClearingReview(false);
    }
  }

  async function saveAll(): Promise<boolean> {
    setError(null);
    // Validate factors / damage / streak settings
    const factors = parseMap("Reward", factorInputs) as QuestFactors | null;
    if (!factors) return false;
    const coinDamage = parseMap("Coin damage", coinDamageInputs);
    if (!coinDamage) return false;
    const healthDamage = parseMap("Health damage", healthDamageInputs);
    if (!healthDamage) return false;
    const dmg = Number(damageFactor);
    if (!Number.isFinite(dmg) || dmg < 0) {
      setError("Damage factor must be a non-negative number");
      return false;
    }
    const sFactor = Number(streakFactorInput);
    if (!Number.isFinite(sFactor) || sFactor < 0) {
      setError("Streak factor must be a non-negative number");
      return false;
    }
    const sCap = Number(streakCapInput);
    if (!Number.isFinite(sCap) || sCap < 0 || !Number.isInteger(sCap)) {
      setError("Streak cap must be a non-negative integer");
      return false;
    }
    const nFactor = Number(neglectFactorInput);
    if (!Number.isFinite(nFactor) || nFactor < 0) {
      setError("Neglect factor must be a non-negative number");
      return false;
    }
    const nCap = Number(neglectCapInput);
    if (!Number.isFinite(nCap) || nCap < 0 || !Number.isInteger(nCap)) {
      setError("Neglect cap must be a non-negative integer");
      return false;
    }
    const tbChance = Number(todoBonusDailyChanceInput);
    if (!Number.isFinite(tbChance) || tbChance < 0 || tbChance > 100) {
      setError("Todo bonus daily chance must be between 0 and 100");
      return false;
    }
    const tbMult = Number(todoBonusMultiplierInput);
    if (!Number.isFinite(tbMult) || tbMult < 0) {
      setError("Todo bonus multiplier must be a non-negative number");
      return false;
    }
    const tbBias = Number(todoBonusAgeBiasInput);
    if (!Number.isFinite(tbBias)) {
      setError("Todo bonus age bias must be a finite number");
      return false;
    }
    if (!/^\d{2}:\d{2}$/.test(digestTime)) {
      setError("Digest time must be HH:MM");
      return false;
    }
    if (!/^\d{2}:\d{2}$/.test(bonusNotifTime)) {
      setError("Bonus notification time must be HH:MM");
      return false;
    }
    const retroPct = Number(retroDeductionInput);
    if (!Number.isFinite(retroPct) || retroPct < 0 || retroPct > 100) {
      setError("Retro completion coins must be a percent between 0 and 100");
      return false;
    }
    const retroLookback = Number(retroLookbackInput);
    if (!Number.isFinite(retroLookback) || retroLookback < 0 || !Number.isInteger(retroLookback)) {
      setError("Retro look-back days must be a non-negative integer");
      return false;
    }
    const allDailiesBonusAmount = Number(allDailiesBonusAmountInput);
    if (!Number.isFinite(allDailiesBonusAmount) || allDailiesBonusAmount < 0) {
      setError("All dailies bonus amount must be a non-negative number");
      return false;
    }
    if (advancedMode) {
      const dailyErr = validateFormula(dailyRewardFormulaInput);
      if (dailyErr) {
        setError(`Daily reward formula: ${dailyErr}`);
        return false;
      }
      const todoErr = validateFormula(todoRewardFormulaInput);
      if (todoErr) {
        setError(`Todo reward formula: ${todoErr}`);
        return false;
      }
      const dfErr = validateFormula(damageFormulaInput);
      if (dfErr) {
        setError(`Damage formula: ${dfErr}`);
        return false;
      }
    }
    // Validate player state
    const h = Number(health);
    const mh = Number(maxHealth);
    const c = Number(coins);
    if (!Number.isFinite(h) || h < 0) {
      setError("Health must be non-negative");
      return false;
    }
    if (!Number.isFinite(mh) || mh < 1) {
      setError("Max health must be at least 1");
      return false;
    }
    if (!Number.isFinite(c) || c < 0) {
      setError("Coins must be non-negative");
      return false;
    }
    setSaving(true);
    try {
      const requests: Promise<Response>[] = [];
      requests.push(
        fetch("/modules/quest/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            factors,
            damageFactor: dmg,
            coinDamage,
            healthDamage,
            simulationDate: simulationDate || null,
            streakFactor: sFactor,
            streakCap: sCap,
            neglectFactor: nFactor,
            neglectCap: nCap,
            advancedMode,
            dailyRewardFormula: advancedMode ? dailyRewardFormulaInput.trim() : null,
            todoRewardFormula: advancedMode ? todoRewardFormulaInput.trim() : null,
            damageFormula: advancedMode ? damageFormulaInput.trim() : null,
            todoBonusEnabled,
            todoBonusDailyChance: tbChance,
            todoBonusMultiplier: tbMult,
            todoBonusAgeBias: tbBias,
            digestEnabled,
            digestTime,
            bonusNotifEnabled,
            bonusNotifTime,
            bonusNotifAlways,
            remindersEnabled,
            retroCompletionEnabled,
            retroCompletionMultiplier: retroPct / 100,
            retroLookbackDays: retroLookback,
            allDailiesBonusEnabled,
            allDailiesBonusAmount,
          }),
        }),
      );
      requests.push(
        fetch("/modules/quest/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ health: h, max_health: mh, balance: c }),
        }),
      );
      const responses = await Promise.all(requests);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const j = await failed.json().catch(() => ({}));
        toast.error(j.error ?? "Failed to save");
        setError(j.error ?? "Failed to save");
        return false;
      }
      // Persist forced-todo-bonus override if it changed.
      if ((forceDraftId || null) !== (forcedTodoId || null)) {
        const fbRes = await fetch("/modules/quest/api/debug/force-bonus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: forceDraftId || null }),
        });
        if (!fbRes.ok) {
          const j = await fbRes.json().catch(() => ({}));
          toast.error(j.error ?? "Failed to save bonus override");
          setError(j.error ?? "Failed to save bonus override");
          return false;
        }
        const data = await fbRes.json().catch(() => ({}));
        const id = typeof data.forcedTodoBonusId === "string" ? data.forcedTodoBonusId : null;
        setForcedTodoId(id);
        setForceDraftId(id ?? "");
      }
      // Refresh balance / ledger and reflect saved streak values
      const bRes = await fetch("/modules/quest/api/balance");
      if (bRes.ok) {
        const data = await bRes.json();
        setBalance(data.balance);
        setCoins(String(data.balance));
        setLedger(data.ledger ?? []);
      }
      toast.success("Settings saved");
      // Refresh the pristine baseline on the next render so balance/ledger refetch settles first.
      setPristineDirty(true);
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function computedReward(d: Difficulty): number {
    const n = Number(factorInputs[d]);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.max(0, n);
  }
  void computedReward;

  if (loading) {
    return (
      <div className="page">
        <div className="page-container">
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-with-bottom-bar">
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: "5rem" }}
      />
      {/* PAGE SCROLL — the scroll surface; sits OUTSIDE page-container's padding so the scrollbar gutter doesn't make right padding > left padding. */}
      <div className="page-scroll">
      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">
          <SettingsBackLink
            label="Home"
            fallback="/modules/quest/ui/home"
            onNavigate={() => attemptNavigate("/modules/quest/ui/home")}
          />
          <h1 className="text-page-title settings-title">
            <Settings className="w-6 h-6" />
            Settings
          </h1>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
            {error}
          </div>
        )}

        {/* DIFFICULTY TABLE CARD */}
        <section className="card mb-6">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="text-card-title">Difficulty</h2>

            {/* ADVANCED MODE TOGGLE */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-secondary">Advanced mode</span>
              <input
                type="checkbox"
                checked={advancedMode}
                onChange={(e) => setAdvancedMode(e.target.checked)}
                className="cursor-pointer"
              />
            </label>
          </div>
          <p className="text-secondary text-sm mb-4">
            {advancedMode
              ? "Reward and streak bonus use custom formulas. Coin / Health Damage apply to negative habits — set to 0 to disable."
              : "Reward is the coin payout for tasks and positive habits. Coin / Health Damage apply to negative habits — set to 0 to disable."}
          </p>

          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full min-w-[20rem] text-sm table-fixed">
              {/* LABEL COLUMN — must fit the uppercase "DIFFICULTY" header (the
                  widest thing in the column) or the header paints out over the
                  Reward column; the table is `table-fixed`, so content can't
                  widen it on its own. */}
              <colgroup>
                <col className="w-28" />
                <col />
                <col />
              </colgroup>
              <thead>
                {/* The row's `text-xs` is defeated by `.text-secondary` (a plain
                    globals.css rule, which outranks a Tailwind utility layer), so
                    the size is set on each cell — inherited 0.9rem loses to a
                    utility applied directly to the cell. */}
                <tr className="text-secondary text-xs uppercase tracking-wide">
                  <th className="text-left font-semibold py-2 px-2 text-xs">Difficulty</th>
                  <th className="font-semibold py-2 px-2 text-xs">
                    <span className="inline-flex items-center justify-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-yellow-500" />
                      Reward
                    </span>
                  </th>
                  <th className="font-semibold py-2 px-2 text-xs">
                    <span className="inline-flex items-center justify-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-red-500" />
                      Dmg
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTY_ORDER.map((d) => (
                  <tr key={d} className="border-t border-gray-700">
                    <td className="py-2 px-2 font-semibold text-xs sm:text-sm">{DIFF_LABELS[d]}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                        <input
                          type="number"
                          onFocus={(e) => e.currentTarget.select()}
                          step="0.25"
                          min={0}
                          value={factorInputs[d]}
                          onChange={(e) => setFactorInputs((s) => ({ ...s, [d]: e.target.value }))}
                          className="w-full max-w-20 px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <Heart className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <input
                          type="number"
                          onFocus={(e) => e.currentTarget.select()}
                          step="0.25"
                          min={0}
                          value={healthDamageInputs[d]}
                          onChange={(e) => setHealthDamageInputs((s) => ({ ...s, [d]: e.target.value }))}
                          className="w-full max-w-20 px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* STREAK + NEGLECT — paired Factor / Cap rows (simple mode only) */}
          {!advancedMode && (<>
          <div className="mt-6 space-y-3 max-w-xl">
            {!advancedMode && (
              <div className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 sm:gap-3">
                <span className="text-sm font-semibold flex items-center gap-1 text-orange-400">
                  <Flame className="w-4 h-4" />
                  Streak
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-secondary w-12 shrink-0">Factor</span>
                  <input
                    type="number"
                    onFocus={(e) => e.currentTarget.select()}
                    step="0.01"
                    min={0}
                    value={streakFactorInput}
                    onChange={(e) => setStreakFactorInput(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-secondary w-12 shrink-0">Cap</span>
                  <input
                    type="number"
                    onFocus={(e) => e.currentTarget.select()}
                    step="1"
                    min={0}
                    value={streakCapInput}
                    onChange={(e) => setStreakCapInput(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 sm:gap-3">
              <span className="text-sm font-semibold flex items-center gap-1 text-red-400">
                <Skull className="w-4 h-4" />
                Neglect
              </span>
              <label className="flex items-center gap-2">
                <span className="text-xs text-secondary w-12 shrink-0">Factor</span>
                <input
                  type="number"
                  onFocus={(e) => e.currentTarget.select()}
                  step="0.01"
                  min={0}
                  value={neglectFactorInput}
                  onChange={(e) => setNeglectFactorInput(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-secondary w-12 shrink-0">Cap</span>
                <input
                  type="number"
                  onFocus={(e) => e.currentTarget.select()}
                  step="1"
                  min={0}
                  value={neglectCapInput}
                  onChange={(e) => setNeglectCapInput(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right"
                />
              </label>
            </div>
          </div>
          <p className="text-xs text-secondary mt-2 max-w-xl">
            Bonus = base × min(count, cap) × factor. Streak boosts reward on consecutive completions; neglect boosts damage on consecutive misses.
          </p>
          </>)}
          {advancedMode && (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <p className="text-xs text-secondary mb-3 max-w-2xl">
                Formulas return the <em>total</em> value (base + any bonus). Variables available per slot:
                <br />
                <span className="text-primary">Daily reward</span> uses <code className="code-inline">base</code>, <code className="code-inline">streak</code>, <code className="code-inline">coins</code>.
                <br />
                <span className="text-primary">Todo reward</span> uses <code className="code-inline">base</code>, <code className="code-inline">age</code> (days since task creation), <code className="code-inline">coins</code>.
                <br />
                <span className="text-primary">Damage</span> uses <code className="code-inline">base</code>, <code className="code-inline">neglect</code>, <code className="code-inline">coins</code>.
                <br />
                Functions: min, max, floor, ceil, round, abs, sqrt, pow, log. Operators: + - * / % ^ ( ).
              </p>

              <div className="space-y-3 max-w-2xl">
                {/* DAILY REWARD FORMULA */}
                <label className="block">
                  <span className="text-sm font-semibold">Daily reward formula</span>
                  <input
                    type="text"
                    value={dailyRewardFormulaInput}
                    onChange={(e) => setDailyRewardFormulaInput(e.target.value)}
                    placeholder={DEFAULT_DAILY_REWARD_FORMULA}
                    className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent font-mono text-sm"
                  />
                </label>

                {/* TODO REWARD FORMULA */}
                <label className="block">
                  <span className="text-sm font-semibold">Todo reward formula</span>
                  <input
                    type="text"
                    value={todoRewardFormulaInput}
                    onChange={(e) => setTodoRewardFormulaInput(e.target.value)}
                    placeholder={DEFAULT_TODO_REWARD_FORMULA}
                    className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent font-mono text-sm"
                  />
                </label>

                {/* DAMAGE FORMULA */}
                <label className="block">
                  <span className="text-sm font-semibold">Damage formula</span>
                  <input
                    type="text"
                    value={damageFormulaInput}
                    onChange={(e) => setDamageFormulaInput(e.target.value)}
                    placeholder={DEFAULT_DAMAGE_FORMULA}
                    className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent font-mono text-sm"
                  />
                </label>
              </div>
            </div>
          )}
        </section>

        {/* BONUS TASK CARD — combines random roll config, manual override, and email notification */}
        <section className="card mb-6">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="text-card-title">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Bonus Task
            </h2>

            {/* MECHANIC ENABLED TOGGLE */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-secondary">Enabled</span>
              <input
                type="checkbox"
                checked={todoBonusEnabled}
                onChange={(e) => setTodoBonusEnabled(e.target.checked)}
                className="cursor-pointer"
              />
            </label>
          </div>
          <p className="text-secondary text-sm mb-4">
            Each day, with the configured probability, one of your existing todos is randomly tagged
            with a payout multiplier. Eligibility freezes at midnight (todos created today aren't
            eligible until tomorrow), so you can't game the bonus by waiting.
          </p>

          {/* ROLL CONFIG */}
          <div className="space-y-3 max-w-xl">

            {/* DAILY CHANCE */}
            <label className="grid grid-cols-1 sm:grid-cols-[10rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Daily chance (0–100)</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                step="5"
                min={0}
                max={100}
                value={todoBonusDailyChanceInput}
                onChange={(e) => setTodoBonusDailyChanceInput(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>

            {/* MULTIPLIER */}
            <label className="grid grid-cols-1 sm:grid-cols-[10rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Multiplier</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                step="0.5"
                min={0}
                value={todoBonusMultiplierInput}
                onChange={(e) => setTodoBonusMultiplierInput(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>

            {/* AGE BIAS */}
            <label className="grid grid-cols-1 sm:grid-cols-[10rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Age bias</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                step="0.5"
                value={todoBonusAgeBiasInput}
                onChange={(e) => setTodoBonusAgeBiasInput(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>
          </div>
          <p className="text-xs text-secondary mt-2 max-w-xl">
            Bias is the exponent applied to <code className="code-inline">(age + 1)</code> when weighting which todo to pick.
            <span className="block">0 = uniform random · 1 = linear favour older · 2 = strongly favour older · negative = favour newer.</span>
          </p>

          {/* FORCE OVERRIDE SUBSECTION */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <h3 className="text-sm font-semibold mb-1">Force override</h3>
            <p className="text-secondary text-sm mb-3">
              Manually pick which todo gets today's bonus (requires the mechanic to be enabled above;
              the configured multiplier still applies). Persists until cleared.
            </p>
            {todos.length === 0 ? (
              <p className="text-secondary text-sm">No todos to force a bonus on.</p>
            ) : (
              <div className="flex flex-col gap-3 max-w-xl">
                <select
                  value={forceDraftId}
                  onChange={(e) => setForceDraftId(e.target.value)}
                  className="px-3 py-2 rounded border border-gray-600 bg-transparent"
                >
                  <option value="">(no override)</option>
                  {todos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-secondary">
                  Active override: <span className="tabular-nums">{forcedTodoId ? (todos.find((t) => t.id === forcedTodoId)?.title ?? forcedTodoId) : "none"}</span>
                  {(forceDraftId || null) !== (forcedTodoId || null) && (
                    <span className="ml-2 text-yellow-400">(pending — apply with Save Settings)</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* EMAIL NOTIFICATION SUBSECTION */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
              <h3 className="text-sm font-semibold">Email notification</h3>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-secondary">Enabled</span>
                <input
                  type="checkbox"
                  checked={bonusNotifEnabled}
                  onChange={(e) => setBonusNotifEnabled(e.target.checked)}
                  className="cursor-pointer"
                />
              </label>
            </div>
            <p className="text-secondary text-sm mb-3">
              Emails you today&apos;s bonus todo. Fires once per day at or after the chosen time; if
              today&apos;s roll didn&apos;t land a bonus, the email still goes out and says so.
            </p>

            <div className="space-y-3 max-w-md">

              {/* SEND TIME */}
              <label className="grid grid-cols-1 sm:grid-cols-[8rem_auto] items-center gap-2 sm:gap-3">
                <span className="text-sm">Send time (local)</span>
                <input
                  type="time"
                  value={bonusNotifTime}
                  onChange={(e) => setBonusNotifTime(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
                />
              </label>

              {/* ALWAYS-NOTIFY GATE */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bonusNotifAlways}
                  onChange={(e) => setBonusNotifAlways(e.target.checked)}
                  className="mt-1 cursor-pointer"
                />
                <span className="text-sm">
                  Notify every day (even with no bonus)
                  <span className="block text-xs text-secondary">
                    When unchecked (default), the scheduler skips the notification on days where the
                    daily roll didn&apos;t land a bonus.
                  </span>
                </span>
              </label>

              {/* MANUAL TRIGGER */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={sendBonusNotifNow}
                  disabled={sendingBonusNotif}
                  className="h-9 px-3 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 disabled:cursor-not-allowed text-sm cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingBonusNotif ? "Sending..." : "Send bonus notification now (debug)"}
                </button>
                <span className="text-xs text-secondary">
                  Bypasses the enabled/time settings and doesn&apos;t affect today&apos;s scheduled send.
                </span>
              </div>

              {/* CLEAR SENT STAMP */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={clearBonusNotifSent}
                  disabled={clearingBonusNotif || !bonusNotifSentToday}
                  className="h-9 px-3 rounded border border-gray-600 bg-gray-700/30 hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer flex items-center gap-2"
                >
                  {clearingBonusNotif ? "Clearing..." : "Clear today's sent stamp (debug)"}
                </button>
                <span className="text-xs text-secondary">
                  {bonusNotifSentToday
                    ? `Already sent today (${bonusNotifLastSentDate}). Clears the stamp so the scheduler re-fires.`
                    : "No stamp for today — nothing to clear."}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* STREAK DEBUG LINK CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Flame className="w-5 h-5 text-orange-400" />
            Streak Debug
          </h2>
          <p className="text-secondary text-sm mb-4">
            Manually override streak count and last-date per recurring task on a dedicated page.
          </p>
          <Button className="btn-off" onClick={() => attemptNavigate("/modules/quest/ui/debug")}>
            Open Streak Debug
          </Button>
        </section>

        {/* DAILY DIGEST CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Bell className="w-5 h-5" />
            Daily Digest Email
          </h2>
          <p className="text-secondary text-sm mb-4">
            Emails you a once-per-day summary (HP, coins, today&apos;s remaining dailies, open todos).
            The schedule check ticks once a minute server-side; the digest is sent the first time the
            clock reaches or passes your chosen time and won&apos;t re-send until tomorrow. Every email
            carries a tracking ID and a one-click unsubscribe link.
          </p>

          {/* TOGGLE + TIME GROUP */}
          <div className="settings-group max-w-md">
            <SettingsToggleRow label="Enabled" checked={digestEnabled} onChange={setDigestEnabled} />
            <SettingsTimeRow label="Send time (local)" value={digestTime} onChange={setDigestTime} />
          </div>

          <div className="space-y-3 max-w-md mt-3">

            {/* MANUAL TRIGGER */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button className="btn-off" onClick={sendDigestNow} disabled={sendingDigest}>
                <Send className="w-4 h-4" />
                {sendingDigest ? "Sending..." : "Send digest now (debug)"}
              </Button>
              <span className="text-xs text-secondary">
                Bypasses the enabled/time settings and doesn&apos;t affect today&apos;s scheduled send.
              </span>
            </div>

            {/* CLEAR SENT STAMP */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
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
        </section>

        {/* TASK REMINDER EMAILS CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Bell className="w-5 h-5" />
            Task Reminder Emails
          </h2>
          <p className="text-secondary text-sm mb-4">
            Master switch for the per-task reminders you set on individual todos and dailies. When
            off, reminder emails stop going out but the reminders themselves stay configured, and
            the dashboard still badges anything past its reminder time. This is also the switch the
            unsubscribe link in a reminder email flips.
          </p>

          {/* TOGGLE GROUP */}
          <div className="settings-group max-w-md">
            <SettingsToggleRow
              label="Enabled"
              checked={remindersEnabled}
              onChange={setRemindersEnabled}
            />
          </div>
        </section>

        {/* SIMULATION DATE CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">Simulation Date</h2>
          <p className="text-secondary text-sm mb-4">
            Override what date Quest thinks it is — useful for testing daily resets and missed-daily damage. Leave empty to use the real date.
          </p>
          <div className="flex items-center gap-2 max-w-md">
            <input
              type="date"
              value={simulationDate}
              onChange={(e) => setSimulationDate(e.target.value)}
              className="flex-1 px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
            />
            <button
              onClick={() => setSimulationDate("")}
              className="px-3 py-2 rounded border border-gray-600 hover:bg-gray-700 cursor-pointer text-sm"
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-secondary mt-2">
            Currently: <span className="text-primary tabular-nums">{simulationDate || "real date"}</span>. Save via the Difficulty Settings button above.
          </p>
        </section>

        {/* PLAYER STATE CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Heart className="w-5 h-5" />
            Player State
          </h2>
          <p className="text-secondary text-sm mb-4">
            Manually adjust health, max health, and coin balance.
          </p>

          <div className="space-y-3 max-w-md">
            <label className="grid grid-cols-1 sm:grid-cols-[8rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Current Health</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                min={0}
                value={health}
                onChange={(e) => setHealth(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>
            <label className="grid grid-cols-1 sm:grid-cols-[8rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Max Health</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                min={1}
                value={maxHealth}
                onChange={(e) => setMaxHealth(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>
            <label className="grid grid-cols-1 sm:grid-cols-[8rem_auto] items-center gap-2 sm:gap-3">
              <span className="text-sm">Coins</span>
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                min={0}
                value={coins}
                onChange={(e) => setCoins(e.target.value)}
                className="w-full px-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
              />
            </label>
          </div>
          <p className="text-xs text-secondary mt-2">
            Current balance: <span className="text-yellow-500 tabular-nums">{balance}</span>
          </p>
        </section>

        {/* PREVIOUS-DAY REVIEW DEBUG CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Repeat className="w-5 h-5 text-blue-400" />
            Previous-Day Review
          </h2>
          <p className="text-secondary text-sm mb-4">
            Clear today's review acknowledgement to make the modal pop again. This reverses today's backdated daily completions (ledger rows deleted, streak decremented, completion cleared), refunds any death-zeroing from today's damage check, and restores HP by replaying today's damage log.
          </p>
          <button
            onClick={() => setClearReviewConfirmOpen(true)}
            disabled={clearingReview}
            className="h-9 px-3 rounded border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed text-sm cursor-pointer"
          >
            {clearingReview ? "Clearing..." : "Clear Today's Review"}
          </button>
        </section>

        {/* RETROACTIVE COMPLETION CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <CalendarClock className="w-5 h-5 text-amber-400" />
            Retroactive Completion
          </h2>
          <p className="text-secondary text-sm mb-4">
            Lets you mark an overdue daily complete from the calendar after its window has passed, for a reduced coin reward. The HP you already lost for the miss stays lost.
          </p>

          {/* ENABLE TOGGLE */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={retroCompletionEnabled}
              onChange={(e) => setRetroCompletionEnabled(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="text-sm">Allow marking overdue dailies complete</span>
          </label>

          {/* DEDUCTION + LOOK-BACK INPUTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* COINS PERCENT */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-secondary">Coins paid for a late completion (% of normal)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={retroDeductionInput}
                  onChange={(e) => setRetroDeductionInput(e.target.value)}
                  disabled={!retroCompletionEnabled}
                  className="h-9 w-24 px-2 rounded border border-gray-600 bg-transparent text-sm tabular-nums disabled:opacity-50"
                />
                <span className="text-sm text-secondary">%</span>
              </div>
            </label>

            {/* LOOK-BACK DAYS */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-secondary">How many days back you can reach</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={retroLookbackInput}
                  onChange={(e) => setRetroLookbackInput(e.target.value)}
                  disabled={!retroCompletionEnabled}
                  className="h-9 w-24 px-2 rounded border border-gray-600 bg-transparent text-sm tabular-nums disabled:opacity-50"
                />
                <span className="text-sm text-secondary">days</span>
              </div>
            </label>
          </div>
          <p className="text-xs text-secondary mt-3">
            Save via the Difficulty Settings button above.
          </p>
        </section>

        {/* ALL DAILIES BONUS CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            All Dailies Bonus
          </h2>
          <p className="text-secondary text-sm mb-4">
            Pays a flat coin bonus once per day, the moment every daily task scheduled for today gets
            completed. Fires at most once per calendar date.
          </p>

          {/* ENABLE TOGGLE */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={allDailiesBonusEnabled}
              onChange={(e) => setAllDailiesBonusEnabled(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="text-sm">Pay a bonus for completing every daily</span>
          </label>

          {/* BONUS AMOUNT */}
          <label className="flex flex-col gap-1 w-fit">
            <span className="text-xs text-secondary">Bonus amount (coins)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                onFocus={(e) => e.currentTarget.select()}
                min={0}
                step={1}
                value={allDailiesBonusAmountInput}
                onChange={(e) => setAllDailiesBonusAmountInput(e.target.value)}
                disabled={!allDailiesBonusEnabled}
                className="h-9 w-24 px-2 rounded border border-gray-600 bg-transparent text-sm tabular-nums disabled:opacity-50"
              />
              <span className="text-sm text-secondary">coins</span>
            </div>
          </label>
          <p className="text-xs text-secondary mt-3">
            Save via the Difficulty Settings button above.
          </p>
        </section>

        {/* MANTRAS CARD */}
        <section className="card mb-6">
          <h2 className="text-card-title mb-2">
            <Quote className="w-5 h-5 text-blue-500" />
            Mantras
          </h2>
          <p className="text-secondary text-sm mb-4">
            Short reminders to yourself. One is picked at random each day and shown at the top of the
            Quest home page. The pick is stable for the whole day, so it won&apos;t change on refresh.
          </p>

          {/* ADD MANTRA ROW */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newMantraInput}
              onChange={(e) => setNewMantraInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMantra();
                }
              }}
              maxLength={MANTRA_MAX_LENGTH}
              placeholder="Write a mantra..."
              className="flex-1 min-w-0 h-9 px-2 rounded border border-gray-600 bg-transparent text-sm"
            />
            <Button
              onClick={addMantra}
              disabled={!newMantraInput.trim()}
              className="btn-primary shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>

          {/* EMPTY PLACEHOLDER */}
          {mantras.length === 0 && (
            <p className="text-secondary text-sm">No mantras yet — add one above and it will start showing up on the home page.</p>
          )}

          {/* MANTRA LIST */}
          <ul className="space-y-2">
            {mantras.map((mantra) => (
              <li key={mantra.id} className="flex items-center gap-2 py-1 border-b border-gray-800">
                {editingMantraId === mantra.id ? (
                  <>
                    {/* EDIT FIELD */}
                    <input
                      type="text"
                      autoFocus
                      value={editingMantraText}
                      onChange={(e) => setEditingMantraText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveMantraEdit(mantra.id);
                        }
                        if (e.key === "Escape") cancelEditMantra();
                      }}
                      maxLength={MANTRA_MAX_LENGTH}
                      className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-blue-500/50 bg-transparent text-sm"
                    />

                    {/* SAVE EDIT */}
                    <button
                      onClick={() => saveMantraEdit(mantra.id)}
                      disabled={!editingMantraText.trim()}
                      title="Save"
                      className="p-1.5 rounded text-green-500 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    {/* CANCEL EDIT */}
                    <button
                      onClick={cancelEditMantra}
                      title="Cancel"
                      className="p-1.5 rounded text-secondary hover:bg-gray-800 cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    {/* MANTRA TEXT */}
                    <span className="flex-1 min-w-0 text-sm break-words">{mantra.text}</span>

                    {/* EDIT */}
                    <button
                      onClick={() => startEditMantra(mantra)}
                      disabled={isPendingMantra(mantra.id)}
                      title={isPendingMantra(mantra.id) ? "Saving..." : "Edit"}
                      className="p-1.5 rounded text-secondary hover:text-primary hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    {/* DELETE */}
                    <button
                      onClick={() => removeMantra(mantra.id)}
                      disabled={isPendingMantra(mantra.id)}
                      title={isPendingMantra(mantra.id) ? "Saving..." : "Delete"}
                      className="p-1.5 rounded text-red-500 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-secondary mt-3">
            Mantras save as soon as you add, edit, or delete one — no need to hit Save Settings.
          </p>
        </section>

        {/* RECENT ACTIVITY CARD */}
        <section className="card">
          <h2 className="text-card-title mb-4">
            <History className="w-5 h-5" />
            Recent Activity
          </h2>
          {ledger.length === 0 && (
            <p className="text-secondary text-sm">No activity yet.</p>
          )}
          <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {ledger.map((entry) => (
              <li key={entry.id} className="text-sm py-1 border-b border-gray-800">
                {/* MOBILE: two-line layout — date + delta on top, reason below */}
                <div className="flex items-center justify-between gap-2 sm:hidden">
                  <span className="text-secondary text-xs">
                    {new Date(entry.ts_created).toLocaleString()}
                  </span>
                  <span className={`tabular-nums shrink-0 ${entry.delta >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {entry.delta >= 0 ? "+" : "−"}
                    {Math.abs(Number(entry.delta)).toFixed(2)}
                  </span>
                </div>
                <div className="sm:hidden truncate">{entry.reason}</div>
                {/* DESKTOP: single inline row */}
                <div className="hidden sm:flex items-center justify-between">
                  <span className="text-secondary shrink-0">
                    {new Date(entry.ts_created).toLocaleString()}
                  </span>
                  <span className="flex-1 mx-4 truncate">{entry.reason}</span>
                  <span className={`tabular-nums shrink-0 ${entry.delta >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {entry.delta >= 0 ? "+" : "−"}
                    {Math.abs(Number(entry.delta)).toFixed(2)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

      </main>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="bottom-action-bar">
        <button
          onClick={saveAll}
          disabled={saving}
          className="h-10 px-6 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* DISCARD CHANGES CONFIRM MODAL */}
      {discardConfirmHref !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-yellow-500/40 rounded-lg w-full max-w-md">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold">Unsaved changes</h2>
            </div>
            <div className="px-5 py-4 text-sm text-secondary">
              <p>You have unsaved settings changes. Save them, discard them, or stay on the page?</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
              <button
                onClick={() => setDiscardConfirmHref(null)}
                disabled={saving}
                className="h-9 px-3 rounded border border-gray-600 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed text-sm cursor-pointer"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  const href = discardConfirmHref;
                  setDiscardConfirmHref(null);
                  // Mark pristine so the beforeunload listener doesn't re-prompt before the route changes.
                  pristineRef.current = fingerprint();
                  setPristineDirty(false);
                  router.push(href);
                }}
                disabled={saving}
                className="h-9 px-3 rounded bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm cursor-pointer"
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  const href = discardConfirmHref;
                  const ok = await saveAll();
                  if (!ok) return;
                  // Mark pristine so the beforeunload listener doesn't re-prompt before the route changes.
                  pristineRef.current = fingerprint();
                  setPristineDirty(false);
                  setDiscardConfirmHref(null);
                  router.push(href);
                }}
                disabled={saving}
                className="h-9 px-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm cursor-pointer"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR REVIEW CONFIRM MODAL */}
      {clearReviewConfirmOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

          {/* MODAL CARD */}
          <div className="bg-gray-900 border border-red-500/40 rounded-lg w-full max-w-md">

            {/* HEADER */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-700">
              <Repeat className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold">Clear Today's Review?</h2>
            </div>

            {/* BODY */}
            <div className="px-5 py-4 space-y-2 text-sm text-secondary">
              <p>This will:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Delete today's backdated daily completions (ledger rows removed, streak decremented, completion cleared)</li>
                <li>Refund any death-zeroing from today's damage check</li>
                <li>Restore HP using today's damage journal</li>
                <li>Clear the review acknowledgement so the modal pops on next home load</li>
              </ul>
            </div>

            {/* FOOTER */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
              <button
                onClick={() => setClearReviewConfirmOpen(false)}
                disabled={clearingReview}
                className="h-9 px-3 rounded border border-gray-600 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={clearTodayReview}
                disabled={clearingReview}
                className="h-9 px-3 rounded bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm cursor-pointer"
              >
                {clearingReview ? "Clearing..." : "Clear Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

