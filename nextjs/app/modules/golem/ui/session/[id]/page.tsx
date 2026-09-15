"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter, useSearchParams } from "next/navigation";
import { StickyNote, Plus, Circle, CircleCheck, RotateCcw, Play, Loader2, Timer, ArrowLeft, Edit2, Save, Trash2, X, Sparkles, ArrowLeftRight, ClipboardList, Dumbbell, MapPin, Flame, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SegmentWithSets, TargetSegment, SuggestedExercise } from "../../../types/segment";
import { ExerciseSummary } from "../../../types/exercise";
import { DaySlot } from "../../../types/dayArchetype";
import SessionEngineControls from "../../../components/SessionEngineControls";
import { Location } from "../../../types/location";
import DeleteSessionModal from "./DeleteSessionModal";
import ResetSessionModal from "./ResetSessionModal";
import ReviewSessionModal from "./ReviewSessionModal";
import EditSegmentModal from "./EditSegmentModal";
import ExercisePickerModal from "./ExercisePickerModal";
import ExerciseSuggestionsModal from "./ExerciseSuggestionsModal";
import PreWorkoutModal from "./PreWorkoutModal";
import LocationPickerModal from "../../locations/LocationPickerModal";
import { PreSurvey } from "../../../types/preSurvey";
import SessionTimer from "../../../components/SessionTimer";
import RestTimer from "../../../components/RestTimer";
import { formatDuration, formatDateLong, formatLastUsed, secondsToHHMMSS, hhmmssToSeconds } from "../../../utils/format";
import { generateUUID } from "../../../utils/id";
import { useGenerationJob } from "@/lib/useGenerationJob";
import { useConfirm } from "@/lib/useConfirm";

// A generated plan is a snapshot: the engine picked its exercises and prescribed its loads from the
// training history as it stood the moment it ran. Once that snapshot is this many days old the picture
// behind it has moved on — sessions logged since, e1RM drift, freshness/atrophy decay — so the session
// page flags it as possibly out of date and worth regenerating.
const STALE_GENERATION_DAYS = 7;

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { confirm, confirmModal } = useConfirm();

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loggedSegments, setLoggedSegments] = useState<SegmentWithSets[]>([]);
  const [targetSegments, setTargetSegments] = useState<TargetSegment[]>([]);
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [preSurvey, setPreSurvey] = useState<PreSurvey | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [distanceUnits, setDistanceUnits] = useState<{ short: string | null; long: string | null }>({ short: null, long: null });
  const [isWorkoutPickerOpen, setIsWorkoutPickerOpen] = useState(false);
  const [isWarmupPickerOpen, setIsWarmupPickerOpen] = useState(false);

  // INPUT
  const [editedSessionName, setEditedSessionName] = useState("");
  const [editedSessionDescription, setEditedSessionDescription] = useState("");
  const [editedSessionReview, setEditedSessionReview] = useState("");
  const [editedStartDate, setEditedStartDate] = useState("");
  const [editedDuration, setEditedDuration] = useState("");
  const [restTimerSeconds, setRestTimerSeconds] = useState(90); // configured rest length (s); hydrated from localStorage
  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isResettingSession, setIsResettingSession] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [segmentModalData, setSegmentModalData] = useState<SegmentWithSets | null>(null);
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  const [addPickerIsWarmup, setAddPickerIsWarmup] = useState(false);
  const [isDeletingSegment, setIsDeletingSegment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(true);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestedExercise[]>([]);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isAcceptingSuggestions, setIsAcceptingSuggestions] = useState(false);
  const [isPreWorkoutModalOpen, setIsPreWorkoutModalOpen] = useState(false);
  const [isStartingViaPreWorkout, setIsStartingViaPreWorkout] = useState(false);
  const [preWorkoutInitialStep, setPreWorkoutInitialStep] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null); // epoch ms the current rest ends; null = no rest running
  const [isRestTimerEnabled, setIsRestTimerEnabled] = useState(true); // user profile setting; assume on until the profile loads
  const lastSavedSegmentRef = useRef<SegmentWithSets | null>(null);
  const pendingCompletionDurationRef = useRef<number>(0);
  const segmentsForSaveRef = useRef<SegmentWithSets[]>([]);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<SegmentWithSets | null>(null);

  // REST TIMER — between-sets countdown. Duration persists in localStorage; the running
  // rest is tracked as an absolute end time so it stays accurate across re-renders/tab sleeps.
  useEffect(() => {
    const stored = Number(localStorage.getItem("golem_rest_timer_seconds"));
    if (Number.isFinite(stored) && stored >= 15) setRestTimerSeconds(stored);
  }, []);

  // Start (or restart) the rest countdown — fired when a working set is marked complete.
  // Skipped entirely when the user has turned the rest timer off in their Golem profile.
  const handleStartRestTimer = useCallback(() => {
    if (!isRestTimerEnabled) return;
    setRestEndsAt(Date.now() + restTimerSeconds * 1000);
  }, [restTimerSeconds, isRestTimerEnabled]);

  // ±15s: nudge both the running countdown and the saved default (min 15s).
  const handleAdjustRestTimer = useCallback((deltaSeconds: number) => {
    setRestTimerSeconds((prev) => {
      const next = Math.max(15, prev + deltaSeconds);
      try { localStorage.setItem("golem_rest_timer_seconds", String(next)); } catch { /* private mode / quota — non-fatal */ }
      return next;
    });
    setRestEndsAt((prev) => (prev == null ? prev : prev + deltaSeconds * 1000));
  }, []);

  // Dismiss the rest timer (manual skip, or auto once it has elapsed).
  const handleSkipRestTimer = useCallback(() => setRestEndsAt(null), []);

  // DERIVED
  const archetypeSlots = session?.day_archetype_slots ?? []; // slot preview placeholders, bundled with the session (no extra fetch)
  const warmupArchetypeSlots = [...archetypeSlots].filter((s) => s.is_warmup).sort((a, b) => a.order_index - b.order_index);
  const workingArchetypeSlots = [...archetypeSlots].filter((s) => !s.is_warmup).sort((a, b) => a.order_index - b.order_index);
  const timerStart = session?.resumed_at ?? session?.started_at ?? null;
  const timerOffset = session?.resumed_at ? (session.duration ?? 0) : 0;
  const isInProgress = !!timerStart && !session?.is_completed;
  const linkedTargetSegmentIds = new Set(loggedSegments.map((e) => e.target_id).filter(Boolean));
  const unlinkedTargetSegments = targetSegments.filter((t) => !linkedTargetSegmentIds.has(t.id));
  const totalSegmentCount = loggedSegments.length + unlinkedTargetSegments.length;
  const warmupLoggedSegments = loggedSegments.filter((s) => s.is_warmup);
  const workingLoggedSegments = loggedSegments.filter((s) => !s.is_warmup);
  const warmupUnlinkedTargets = unlinkedTargetSegments.filter((t) => t.is_warmup);
  const workingUnlinkedTargets = unlinkedTargetSegments.filter((t) => !t.is_warmup);
  const hasWarmupSection = warmupLoggedSegments.length > 0 || warmupUnlinkedTargets.length > 0;

  // GENERATION AGE — engine-generated targets carry the archetype they came from (provenance) plus the
  // timestamp they were written; a generation replaces every target at once, so the newest of those is
  // when this session's plan was last generated. Targets without an archetype (manual adds, LLM) don't
  // count — they say nothing about when the engine last ran.
  // An unparseable, epoch-zero, or future stamp describes nothing real (a clock-skewed client would
  // otherwise read "-1d ago"), so it is ignored rather than rendered — no readout, no warning.
  const engineGeneratedAt = targetSegments.reduce<number | null>((newest, target) => {
    if (!target.day_archetype_id) return newest;
    const generatedMs = new Date(target.created_at).getTime();
    if (!Number.isFinite(generatedMs) || generatedMs <= 0 || generatedMs > Date.now()) return newest;
    return newest === null || generatedMs > newest ? generatedMs : newest;
  }, null);
  const generationAgeDays = engineGeneratedAt === null ? null : Math.floor((Date.now() - engineGeneratedAt) / (1000 * 60 * 60 * 24));
  // Only worth flagging while the plan is still ahead of the user: an unfinished session that still has
  // unworked targets. A completed session (or one whose targets are all logged) is history, not a plan.
  const isGenerationStale = generationAgeDays !== null
    && generationAgeDays >= STALE_GENERATION_DAYS
    && !session?.is_completed
    && unlinkedTargetSegments.length > 0;

  // Interleave logged segments and unlinked targets by effective order_index
  const combinedWarmupItems = [
    ...warmupLoggedSegments.map(s => ({ type: 'logged' as const, key: s.id, effectiveOrder: s.target?.order_index ?? s.order_index, segment: s })),
    ...warmupUnlinkedTargets.map(t => ({ type: 'target' as const, key: t.id, effectiveOrder: t.order_index, target: t })),
  ].sort((a, b) => a.effectiveOrder - b.effectiveOrder);
  const combinedWorkingItems = [
    ...workingLoggedSegments.map(s => ({ type: 'logged' as const, key: s.id, effectiveOrder: s.target?.order_index ?? s.order_index, segment: s })),
    ...workingUnlinkedTargets.map(t => ({ type: 'target' as const, key: t.id, effectiveOrder: t.order_index, target: t })),
  ].sort((a, b) => a.effectiveOrder - b.effectiveOrder);

  // Build a virtual SegmentWithSets from an unlinked TargetSegment so it can participate in modal navigation.
  // Uses the target's id as a deterministic segment id so findIndex lookups match across renders.
  const instantiateTargetAsSegment = (target: TargetSegment): SegmentWithSets => ({
    id: target.id, // deterministic — stays stable across renders and matches what handleOpenTargetSegment produces
    session_id: id,
    exercise_id: target.exercise_id,
    exercise_name: target.exercise_name,
    exercise_category: target.exercise_category,
    exercise_is_timed: target.exercise_is_timed,
    exercise_distance_type: target.exercise_distance_type,
    target_id: target.id,
    order_index: target.order_index,
    is_warmup: target.is_warmup,
    modifier_id: null,
    modifier_name: null,
    notes: null,
    created_at: new Date(),
    modified_at: new Date(),
    sets: target.sets.map((ts) => ({
      id: ts.id, // deterministic set ids too
      session_segment_id: target.id,
      set_number: ts.set_number,
      is_warmup: ts.is_warmup,
      reps: target.exercise_is_timed ? null : 0,
      weight: 0,
      rpe: null,
      time_seconds: target.exercise_is_timed ? 0 : null,
      distance: null,
      notes: null,
      is_completed: false,
      created_at: new Date(),
      modified_at: new Date(),
    })),
    target,
  });

  // Separate warmup and working navigation lists for modal swipe navigation.
  // Each section has its own nav so swipes stay within warmup OR working — never crossing the boundary.
  // Includes both logged segments and unlinked targets (as virtual segments), sorted by effective order_index.
  const effectiveOrder = (s: SegmentWithSets) => s.target?.order_index ?? s.order_index;
  const warmupNavSegments: SegmentWithSets[] = [
    ...warmupLoggedSegments,
    ...warmupUnlinkedTargets.map(instantiateTargetAsSegment),
  ].sort((a, b) => effectiveOrder(a) - effectiveOrder(b));
  const workingNavSegments: SegmentWithSets[] = [
    ...workingLoggedSegments,
    ...workingUnlinkedTargets.map(instantiateTargetAsSegment),
  ].sort((a, b) => effectiveOrder(a) - effectiveOrder(b));

  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewSession = searchParams.get("new") === "true";

  // GENERATION JOB HOOKS
  const { startPolling: startGeneratePolling } = useGenerationJob({
    onComplete: (result: any) => {
      fetchSegments();
      toast.success("Exercises generated");
      setIsGenerating(false);

      // Check for suggested exercises in the job result
      if (result?.suggestedExercises?.length > 0) {
        setPendingSuggestions(result.suggestedExercises);
        setIsSuggestionsModalOpen(true);
      }
    },
    onError: (error) => {
      toast.error(error);
      setIsGenerating(false);
    },
  });

  const { startPolling: startAnalyzePolling } = useGenerationJob({
    onComplete: () => {
      fetchSession();
      toast.success("Analysis generated");
      setIsAnalyzing(false);
    },
    onError: (error) => {
      toast.error(error);
      setIsAnalyzing(false);
    },
  });

  // LOAD DATA
  useEffect(() => {
    fetchSessionData();
    fetchExercises();
    fetchPreSurvey();
    loadLocations();
    loadUserProfile();
  }, [id]);

  // STALE-CLOCK REFETCH — the abandoned-session case is a page left open while the phone sleeps, so
  // the mount fetch already happened hours ago and nothing would re-read the trimmed duration the
  // server writes (lib/staleSessionTimer). Re-reading the session whenever the tab comes back to the
  // foreground is what makes the trim visible without a manual reload.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") void fetchSession();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [id]);

  // Load the session-relevant user profile settings: preferred distance display units (per band) for the
  // per-set distance input, and whether the between-sets rest timer is enabled.
  const loadUserProfile = async () => {
    try {
      const resp = await fetch("/modules/golem/api/user-profile");
      if (!resp.ok) return;
      const profile = await resp.json();
      setDistanceUnits({ short: profile.distance_unit_short ?? null, long: profile.distance_unit_long ?? null });
      setIsRestTimerEnabled(profile.rest_timer_enabled ?? true);
    } catch {
      // best-effort; the distance input falls back to default units (meters / km) and the rest timer stays on
    }
  };

  // Locations drive which equipment + enabled-exercise list generation uses.
  const loadLocations = async () => {
    try {
      const resp = await fetch("/modules/golem/api/locations");
      if (!resp.ok) return;
      setLocations(await resp.json());
    } catch {
      // best-effort; the location controls just hide
    }
  };

  // After the workout location changes, refresh locations + the exercise list it governs.
  const handleWorkoutLocationChanged = async () => {
    await loadLocations();
    await fetchExercises();
  };

  // Initialize edit mode for new sessions
  useEffect(() => {
    if (isNewSession && session && !isLoading) {
      handleStartEditSession();
      router.replace(`/modules/golem/ui/session/${id}`, { scroll: false });
    }
  }, [isNewSession, session, isLoading]);

  // Reflect the open segment modal in the URL (?segment=<id>) so a page refresh re-opens it.
  // Uses router.replace to persist the param without polluting browser history.
  const updateSegmentParam = (segmentId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (segmentId) {
      params.set("segment", segmentId);
    } else {
      params.delete("segment");
    }
    const query = params.toString();
    router.replace(`/modules/golem/ui/session/${id}${query ? `?${query}` : ""}`, { scroll: false });
  };

  // On load (or refresh), re-open the segment modal named by ?segment=<id> once data is ready.
  const didRestoreSegmentRef = useRef(false);
  useEffect(() => {
    if (didRestoreSegmentRef.current) return;
    if (isLoading || !session) return;
    const restoreSegmentId = searchParams.get("segment");
    if (!restoreSegmentId) {
      didRestoreSegmentRef.current = true;
      return;
    }
    // navSegments hold both logged segments and instantiated targets, keyed by their deterministic ids.
    const restoreSegment = [...workingNavSegments, ...warmupNavSegments].find((s) => s.id === restoreSegmentId);
    if (restoreSegment) {
      setSegmentModalData(restoreSegment);
      setIsSegmentModalOpen(true);
      didRestoreSegmentRef.current = true;
    }
  }, [isLoading, session, searchParams, workingNavSegments, warmupNavSegments]);

  // Keep save ref in sync with loggedSegments (avoids stale closures without triggering re-renders during saves)
  useEffect(() => {
    segmentsForSaveRef.current = loggedSegments;
  }, [loggedSegments]);

  const fetchSessionData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchSession(), fetchSegments()]);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const fetchSession = async () => {
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}`);

      if (response.ok) {
        const data = await response.json();
        setSession(data);

        // A trimmed clock makes the timer jump backwards by hours, which reads as lost data unless
        // we say why. The server only sets this on the read that actually did the trimming, so this
        // fires once per abandonment, not on every poll.
        if (data.timer_trimmed_seconds > 0) {
          toast(`Timer was idle for ${formatDuration(data.timer_trimmed_seconds)} — duration set to ${formatDuration(data.duration ?? 0)} from your last logged set.`, { icon: "\u23F1\uFE0F", duration: 6000 });
        }
      }
    } catch (error) {
      console.error("Error fetching session:", error);
    }
  }

  const fetchSegments = async () => {
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/segments`);
      if (response.ok) {
        const data = await response.json();
        setLoggedSegments(data.exercises);
        setTargetSegments(data.targets);
      }
    } catch (error) {
      console.error("Error fetching segments:", error);
    }
  };

  const fetchExercises = async () => {
    try {
      const response = await fetch("/modules/golem/api/exercises?include=muscles");
      if (response.ok) {
        const data = await response.json();
        setExercises(data);
      }
    } catch (error) {
      console.error("Error fetching exercises:", error);
    }
  };

  const fetchPreSurvey = async () => {
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/pre-survey`);
      if (response.ok) {
        const data = await response.json();
        setPreSurvey(data);
      }
    } catch (error) {
      console.error("Error fetching pre-survey:", error);
    }
  };

  // SESSION INFO HANDLERS
  const handleStartEditSession = () => {
    if (!session) return;
    setEditedSessionName(session.name);
    setEditedSessionDescription(session.description || "");
    setEditedSessionReview(session.review || "");
    if (session.started_at) {
      // Local Y-M-D, not toISOString's UTC day -- must match the local-timezone
      // write in handleSaveSession's setFullYear() below, or editing near local
      // midnight silently shifts started_at by a day.
      const startedAt = new Date(session.started_at);
      const localYmd = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, "0")}-${String(startedAt.getDate()).padStart(2, "0")}`;
      setEditedStartDate(localYmd);
    }
    if (session.duration != null) {
      setEditedDuration(secondsToHHMMSS(session.duration));
    }
    setIsEditingSession(true);
  };

  const handleCancelEditSession = () => {
    setIsEditingSession(false);
    setEditedSessionName("");
    setEditedSessionDescription("");
    setEditedSessionReview("");
    setEditedStartDate("");
    setEditedDuration("");
  };

  const handleSaveSession = async () => {
    if (!session) return;
    if (!editedSessionName.trim()) {
      toast.error("Session name is required");
      return;
    }

    setIsSavingSession(true);
    try {
      // Build updated started_at from edited date (preserve original time)
      let updatedStartedAt = session.started_at;
      if (session.started_at && editedStartDate) {
        const original = new Date(session.started_at);
        const [year, month, day] = editedStartDate.split("-").map(Number);
        original.setFullYear(year, month - 1, day);
        updatedStartedAt = original;
      }

      // Convert edited duration (HH:MM:SS) back to seconds
      const updatedDuration = editedDuration
        ? hhmmssToSeconds(editedDuration)
        : session.duration;

      const response = await fetch(`/modules/golem/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedSessionName.trim(),
          description: editedSessionDescription.trim() || null,
          review: editedSessionReview.trim() || null,
          analysis: session.analysis,
          started_at: updatedStartedAt,
          resumed_at: session.resumed_at,
          duration: updatedDuration,
          is_current: session.is_current,
          is_completed: session.is_completed,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update session");
        return;
      }

      const updatedSession = await response.json();
      setSession(updatedSession);
      setIsEditingSession(false);
      toast.success("Session saved");

    } catch (error) {
      toast.error("Failed to update session");
      console.error("Error saving session:", error);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    setIsDeletingSession(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to delete session");
        return;
      }

      toast.success("Session deleted");
      router.push("/modules/golem/ui/home");
    } catch (error) {
      toast.error("Failed to delete session");
      console.error("Error deleting session:", error);
    }
  };

  const handleResetSession = async () => {
    setIsResettingSession(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to reset session");
        return;
      }

      const updatedSession = await response.json();
      setSession(updatedSession);
      setLoggedSegments([]);
      setTargetSegments([]); // reset also clears the generated target segments (filled slots)
      setIsResetModalOpen(false);
      toast.success("Session reset");
    } catch (error) {
      toast.error("Failed to reset session");
      console.error("Error resetting session:", error);
    } finally {
      setIsResettingSession(false);
    }
  };

  // STATUS HANDLERS
  const updateSessionStatus = async (overrides: Partial<WorkoutSession>) => {
    if (!session) return;
    const previousSession = session;
    const body = {
      name: session.name,
      description: session.description,
      review: session.review,
      analysis: session.analysis,
      started_at: session.started_at,
      resumed_at: session.resumed_at,
      duration: session.duration,
      is_current: session.is_current,
      is_completed: session.is_completed,
      ...overrides,
    };
    // OPTIMISTIC UPDATE — the PUT persists exactly the fields we send and echoes them
    // back unchanged, so merging the overrides locally is safe; roll back on failure.
    setSession({ ...session, ...overrides });
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update session");
        setSession(previousSession);
        return;
      }
    } catch (error) {
      toast.error("Failed to update session");
      console.error("Error updating session:", error);
      setSession(previousSession);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStartSession = () => {
    // Pre-workout wizard gates the session start — modal opens, then on Save/Skip the session actually starts.
    setIsStartingViaPreWorkout(true);
    setPreWorkoutInitialStep(0);
    setIsPreWorkoutModalOpen(true);
  };

  // Called when the user advances out of the start-flow wizard.
  // didSave === true → user clicked Save & Continue, so chain into exercise generation.
  // didSave === false → user clicked Skip, just start the session.
  const handlePreWorkoutContinueToStart = (didSave: boolean) => {
    setIsPreWorkoutModalOpen(false);
    setIsStartingViaPreWorkout(false);
    updateSessionStatus({ is_current: true, started_at: new Date() });
    if (didSave) {
      handleGenerateExercises();
    }
  };

  const openPreWorkout = (step: number = 0) => {
    setIsStartingViaPreWorkout(false);
    setPreWorkoutInitialStep(step);
    setIsPreWorkoutModalOpen(true);
  };

  const handleResumeSession = () => {
    updateSessionStatus({ is_completed: false, is_current: true, resumed_at: new Date() });
  };

  const handleCompleteSession = async () => {
    if (!session) return;

    // Check for incomplete working sets and confirm if any exist
    const incompleteWorkingSets = loggedSegments
      .flatMap(seg => seg.sets)
      .filter(s => !s.is_warmup && !s.is_completed);

    if (incompleteWorkingSets.length > 0) {
      const confirmed = await confirm({
        title: "Incomplete Sets",
        message: `You have ${incompleteWorkingSets.length} incomplete working set${incompleteWorkingSets.length > 1 ? "s" : ""}. Complete session anyway?`,
        confirmLabel: "Complete Anyway",
      });
      if (!confirmed) return;
    }

    // Calculate elapsed time and store for use after review modal
    const elapsed = session.resumed_at
      ? (session.duration ?? 0) + Math.floor((Date.now() - new Date(session.resumed_at).getTime()) / 1000)
      : Math.floor((Date.now() - new Date(session.started_at!).getTime()) / 1000);
    pendingCompletionDurationRef.current = elapsed;

    setIsReviewModalOpen(true);
  };

  const handleReviewSubmit = (review: string) => {
    updateSessionStatus({
      is_completed: true,
      is_current: false,
      resumed_at: null,
      duration: pendingCompletionDurationRef.current,
      review: review.trim() || null,
    }).then(() => setIsReviewModalOpen(false));
  };

  const handleReviewSkip = () => {
    updateSessionStatus({
      is_completed: true,
      is_current: false,
      resumed_at: null,
      duration: pendingCompletionDurationRef.current,
    }).then(() => setIsReviewModalOpen(false));
  };

  // SEGMENT HANDLERS
  const handleOpenSegment = (segment: SegmentWithSets) => {
    setSegmentModalData(segment);
    setIsSegmentModalOpen(true);
    updateSegmentParam(segment.id);
  };

  // Initialize a new EditSegmentModal and pass target set data (modal will handle filling out sets[])
  // Uses deterministic IDs so the segment matches its entry in navigationSegments for swipe navigation.
  const handleOpenTargetSegment = (target: TargetSegment) => {
    const targetSegment = instantiateTargetAsSegment(target);
    setSegmentModalData(targetSegment);
    setIsSegmentModalOpen(true);
    updateSegmentParam(targetSegment.id);
  };

  const handleAddSegment = () => {
    setAddPickerIsWarmup(false);
    setIsAddPickerOpen(true);
  };

  const handleAddWarmupSegment = () => {
    setAddPickerIsWarmup(true);
    setIsAddPickerOpen(true);
  };

  // Create a new segment from the exercise selected in the add picker, then open EditSegmentModal
  const handleAddPickerSelect = (exercise: ExerciseSummary) => {
    const isWarmup = addPickerIsWarmup;
    const sourceSegments = isWarmup ? warmupLoggedSegments : workingLoggedSegments;
    const sourceTargets = isWarmup ? warmupUnlinkedTargets : workingUnlinkedTargets;
    const segmentId = generateUUID();
    const newSegment: SegmentWithSets = {
      id: segmentId,
      session_id: id,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_category: exercise.category,
      exercise_is_timed: exercise.is_timed,
      exercise_distance_type: exercise.distance_type,
      target_id: null,
      order_index: Math.max(0, ...sourceSegments.map(s => s.order_index), ...sourceTargets.map(t => t.order_index)) + 1,
      is_warmup: isWarmup,
      modifier_id: null,
      modifier_name: null,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: [{
        id: generateUUID(),
        session_segment_id: segmentId,
        set_number: 1,
        is_warmup: isWarmup,
        reps: exercise.is_timed ? null : 0,
        weight: 0,
        rpe: null,
        time_seconds: exercise.is_timed ? 0 : null,
        distance: null,
        notes: null,
        is_completed: false,
        created_at: new Date(),
        modified_at: new Date(),
      }],
      target: null,
    };
    setIsAddPickerOpen(false);
    handleSaveSegment(newSegment);
    setSegmentModalData(newSegment);
    setIsSegmentModalOpen(true);
    updateSegmentParam(segmentId);
  };

  const handleSaveSegment = async (editedSegment: SegmentWithSets) => {
    // Auto-start session on first logged set if not already started
    if (session && !session.started_at && !session.is_completed) {
      updateSessionStatus({ is_current: true, started_at: new Date() });
    }

    // Store latest segment for optimistic update on modal close
    lastSavedSegmentRef.current = editedSegment;

    // If a save is in progress, hold the latest state and save it once the current request completes.
    // Only the most recent state is kept — intermediate changes are discarded since only the final state matters.
    if (isSavingRef.current) {
      pendingSaveRef.current = editedSegment;
      return;
    }

    isSavingRef.current = true;

    try {
      // Build updated segments list from ref (avoids stale closures without triggering re-renders)
      const currentSegments = segmentsForSaveRef.current;
      const exists = currentSegments.some(ex => ex.id === editedSegment.id);
      const updatedSegments = exists
        ? currentSegments.map(ex => ex.id === editedSegment.id ? editedSegment : ex)
        : [...currentSegments, editedSegment];

      // Strip trailing empty uncompleted sets before saving (preserve empty sets before completed ones)
      const filteredSegments = updatedSegments.map(ex => {
        const maxWarmupSetNumber = Math.max(0, ...ex.sets.filter(s => s.is_warmup && (s.is_completed || hasSetData(s))).map(s => s.set_number));
        const maxWorkingSetNumber = Math.max(0, ...ex.sets.filter(s => !s.is_warmup && (s.is_completed || hasSetData(s))).map(s => s.set_number));

        return {
          ...ex,
          sets: ex.sets.filter(s => {
            if (s.is_completed || hasSetData(s)) return true;
            // Keep empty uncompleted sets that precede a completed/data set in their group
            const maxInGroup = s.is_warmup ? maxWarmupSetNumber : maxWorkingSetNumber;
            return s.set_number <= maxInGroup;
          }),
        };
      });

      const response = await fetch(`/modules/golem/api/sessions/${id}/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filteredSegments),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to save");
      }

      // Update ref so subsequent saves read current data (no re-render)
      segmentsForSaveRef.current = updatedSegments;
    } catch (error) {
      toast.error("Failed to save");
      console.error("Error saving segment:", error);
    } finally {
      isSavingRef.current = false;

      // If a newer state came in while saving, send it now
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        handleSaveSegment(pending);
      }
    }
  };

  const handleDeleteSegment = async () => {
    if (!segmentModalData) return;

    // If the segment is unsaved and has no target, just close the modal
    const existsInDb = loggedSegments.some(ex => ex.id === segmentModalData.id);
    if (!existsInDb && !segmentModalData.target_id) {
      setIsSegmentModalOpen(false);
      return;
    }

    setIsDeletingSegment(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/segments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: existsInDb ? segmentModalData.id : null,
          targetId: segmentModalData.target_id || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to remove exercise");
        return;
      }

      await fetchSegments();
      setIsSegmentModalOpen(false);
      toast.success("Exercise removed");
    } catch (error) {
      toast.error("Failed to remove exercise");
      console.error("Error removing segment:", error);
    } finally {
      setIsDeletingSegment(false);
    }
  };

  // GENERATE HANDLER
  const handleGenerateExercises = async () => {
    if (!session?.description?.trim()) {
      toast.error("Session description is required for generation");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/generate`, {
        method: "POST",
      });

      if (response.status === 202) {
        const { jobId } = await response.json();
        startGeneratePolling(jobId);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate exercises");
        setIsGenerating(false);
        return;
      }
    } catch (error) {
      toast.error("Failed to generate exercises");
      console.error("Error generating exercises:", error);
      setIsGenerating(false);
    }
  };

  // ACCEPT SUGGESTED EXERCISES HANDLER
  const handleAcceptSuggestions = async (accepted: SuggestedExercise[]) => {
    setIsAcceptingSuggestions(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/accept-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercises: accepted }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to create exercises");
        return;
      }

      const { created } = await response.json();
      toast.success(`${created} exercise${created !== 1 ? "s" : ""} added`);
      setIsSuggestionsModalOpen(false);
      setPendingSuggestions([]);
      fetchSegments(); // Reload to show new targets
    } catch (error) {
      toast.error("Failed to create exercises");
      console.error("Error accepting suggestions:", error);
    } finally {
      setIsAcceptingSuggestions(false);
    }
  };

  // ANALYZE HANDLER
  const handleAnalyzeSession = async () => {
    if (!session?.is_completed) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/analyze`, {
        method: "POST",
      });

      if (response.status === 202) {
        const { jobId } = await response.json();
        startAnalyzePolling(jobId);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to analyze session");
        setIsAnalyzing(false);
        return;
      }
    } catch (error) {
      toast.error("Failed to analyze session");
      console.error("Error analyzing session:", error);
      setIsAnalyzing(false);
    }
  };

  // Helper: format an archetype slot's prescription (sets×reps, or sets×time for cardio, or open-ended sets for strength holds)
  const formatSlotDose = (slot: DaySlot): string => {
    if (slot.progression_model === "time_effort") {
      return slot.time_low_seconds != null && slot.time_high_seconds != null
        ? `${slot.set_target}×${slot.time_low_seconds}-${slot.time_high_seconds}s`
        : `${slot.set_target} sets`;
    }
    return `${slot.set_target}×${slot.rep_low}-${slot.rep_high}`;
  };

  // Helper: check if a set contains any manually entered data
  const hasSetData = (set: { weight: number; reps: number | null; rpe: number | null; time_seconds: number | null; notes: string | null }) =>
    set.weight > 0 || (set.reps != null && set.reps > 0) || set.rpe !== null || (set.time_seconds != null && set.time_seconds > 0) || (set.notes !== null && set.notes !== '');

  const isSegmentComplete = (segment: SegmentWithSets): boolean => {
    return segment.sets.some((s) => s.is_completed);
  };
  const completedSegmentCount = loggedSegments.filter(isSegmentComplete).length;

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <div className="page-container">
          <div className="loading-container py-12">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  // NOT FOUND PLACEHOLDER
  if (!session) {
    return (
      <div className="page">
        <main className="page-container">
          <p className="text-page-subtitle text-center py-8">Session not found</p>
        </main>
      </div>
    );
  }

  return (

    // BACKGROUND
    <div className="page-with-bottom-bar">

      <Toaster position="bottom-center" />

      {/* REST TIMER — floating between-sets countdown; fixed-position so it stays above the
          open segment modal while the user logs the next set. */}
      {restEndsAt != null && (
        <RestTimer
          endsAt={restEndsAt}
          onAdjust={handleAdjustRestTimer}
          onSkip={handleSkipRestTimer}
        />
      )}

      {/* PAGE SCROLL — the scroll surface; sits OUTSIDE page-container's padding so the scrollbar gutter doesn't make right padding > left padding. */}
      <div className="page-scroll">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:gap-3">

          {/* BACK BUTTON */}
          <BackLink fallback="/modules/golem/ui/home" className="btn btn-link self-start sm:self-auto mb-2 sm:mb-0">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* TITLE */}
          <h1 className="text-page-title !mb-0">{session.name}</h1>
        </div>

        {/* LOCATION PILLS — tap to pick which location's equipment + enabled exercises drive
            generation. Warmup can use a different location than the working sets. */}
        {locations.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">

            {/* WORKOUT LOCATION PILL */}
            <Button
              className="btn-pill"
              onClick={() => setIsWorkoutPickerOpen(true)}
              aria-label="Workout location"
            >
              <MapPin className="w-4 h-4" />
              <span>{locations.find((l) => l.is_active)?.name ?? "Set location"}</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </Button>

            {/* WARMUP LOCATION PILL — falls back to "Same as workout" when unset */}
            <Button
              className="btn-pill"
              onClick={() => setIsWarmupPickerOpen(true)}
              aria-label="Warmup location"
            >
              <Flame className="w-4 h-4" />
              <span>{locations.find((l) => l.is_warmup_active)?.name ?? "Warmup: same"}</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </Button>
          </div>
        )}

        {/* STALE GENERATION WARNING — this plan was generated from history that is now days old, so its
            exercise picks and loads may no longer reflect what has been trained (or lost) since. Sits above
            the cards so it is the first thing seen on both mobile and desktop. Advisory only: regenerating
            is the user's call, from the Engine Generation panel. */}
        {isGenerationStale && engineGeneratedAt !== null && (
          <div className="alert-yellow mb-4" data-testid="generation-staleness">

            {/* TITLE */}
            <p className="alert-title">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Generated {formatLastUsed(new Date(engineGeneratedAt))}</span>
            </p>

            {/* EXPLANATION */}
            <p className="alert-text">
              This plan is {generationAgeDays} days old. Its exercises and loads were calculated from your
              training history at that time, so anything logged since — plus recovery and atrophy over the
              gap — isn&apos;t accounted for. Regenerate from the Engine Generation panel for up-to-date targets.
            </p>
          </div>
        )}

        {/* CARDS */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-6 lg:items-start">

          {/* SESSION INFO CARD */}
          <div className="card lg:sticky lg:top-4 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">

            {/* CARD HEADER — flex-wrap so the action buttons drop to a second row instead of overflowing the narrow desktop column (which would clip the Edit button). */}
            <div className="card-header flex-wrap">

              {/* TITLE */}
              <h2 className="text-card-title">Session Info</h2>

              {/* SESSION ACTION BUTTONS */}
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto sm:h-9">
                {!isEditingSession ? (

                  // VIEW MODE ACTIONS
                  <>

                    {/* DELETE BUTTON */}
                    <Button className="btn-red w-full sm:w-auto" onClick={() => setIsDeleteModalOpen(true)}>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </Button>

                    {/* RESET BUTTON */}
                    <Button className="btn-off w-full sm:w-auto" onClick={() => setIsResetModalOpen(true)}>
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset</span>
                    </Button>

                    {/* EDIT BUTTON */}
                    <Button className="btn-blue w-full sm:w-auto" onClick={handleStartEditSession}>
                      <Edit2 className="w-4 h-4" />
                      <span>Edit</span>
                    </Button>
                  </>
                ) : (

                  // EDIT MODE ACTIONS
                  <>

                    {/* CANCEL BUTTON */}
                    <Button className="btn-link w-full sm:w-auto" onClick={handleCancelEditSession} disabled={isSavingSession}>
                      <X className="w-4 h-4" />
                      <span>Cancel</span>
                    </Button>

                    {/* SAVE BUTTON */}
                    <Button className="btn-green w-full sm:w-auto" onClick={handleSaveSession} disabled={isSavingSession}>
                      <Save className="w-4 h-4" />
                      <span>{isSavingSession ? "Saving..." : "Save"}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {isEditingSession ? (
                <>

                  {/* NAME INPUT */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <input
                      type="text"
                      value={editedSessionName}
                      onChange={(e) => setEditedSessionName(e.target.value)}
                      autoCapitalize="words"
                      className="input-field"
                    />
                  </div>

                  {/* DAY ARCHETYPE — read-only readout (assignment happens via the Engine Generation picker, not here), kept
                      visible in edit mode too so the user can always see which day archetype the session belongs to. */}
                  {session.day_archetype_name && (
                    <div>
                      <label className="text-secondary">Day Archetype</label>
                      <p className="text-primary break-words">{session.day_archetype_name}</p>
                    </div>
                  )}

                  {/* DURATION INPUT (HH:MM:SS) */}
                  {session.started_at && session.duration != null && !isInProgress && (
                    <div>
                      <label className="text-secondary">Duration</label>
                      <div className="flex items-center gap-1">
                        {/* HOURS */}
                        <input
                          id="duration-hours"
                          type="number"
                          min="0"
                          max="99"
                          value={editedDuration.split(":")[0] || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const parts = editedDuration.split(":");
                            const raw = e.target.value;
                            parts[0] = raw === "" ? "" : String(Math.max(0, parseInt(raw) || 0)).padStart(2, "0");
                            setEditedDuration(parts.join(":"));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "") {
                              const parts = editedDuration.split(":");
                              parts[0] = "00";
                              setEditedDuration(parts.join(":"));
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("duration-minutes")?.focus(); } }}
                          className="input-field !min-w-10 sm:max-w-20 !px-2 text-center"
                        />
                        <span className="text-muted font-medium">h</span>

                        {/* MINUTES */}
                        <input
                          id="duration-minutes"
                          type="number"
                          min="0"
                          max="59"
                          value={editedDuration.split(":")[1] || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const parts = editedDuration.split(":");
                            const raw = e.target.value;
                            parts[1] = raw === "" ? "" : String(Math.min(59, Math.max(0, parseInt(raw) || 0))).padStart(2, "0");
                            setEditedDuration(parts.join(":"));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "") {
                              const parts = editedDuration.split(":");
                              parts[1] = "00";
                              setEditedDuration(parts.join(":"));
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("duration-seconds")?.focus(); } }}
                          className="input-field !min-w-10 sm:max-w-20 !px-2 text-center"
                        />
                        <span className="text-muted font-medium">m</span>

                        {/* SECONDS */}
                        <input
                          id="duration-seconds"
                          type="number"
                          min="0"
                          max="59"
                          value={editedDuration.split(":")[2] || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const parts = editedDuration.split(":");
                            const raw = e.target.value;
                            parts[2] = raw === "" ? "" : String(Math.min(59, Math.max(0, parseInt(raw) || 0))).padStart(2, "0");
                            setEditedDuration(parts.join(":"));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "") {
                              const parts = editedDuration.split(":");
                              parts[2] = "00";
                              setEditedDuration(parts.join(":"));
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                          className="input-field !min-w-10 sm:max-w-20 !px-2 text-center"
                        />
                        <span className="text-muted font-medium">s</span>
                      </div>
                    </div>
                  )}

                  {/* DATE INPUT */}
                  {session.started_at && !isInProgress && (
                    <div>
                      <label className="text-secondary">Date</label>
                      <input
                        type="date"
                        value={editedStartDate}
                        onChange={(e) => setEditedStartDate(e.target.value)}
                        className="input-field"
                      />
                    </div>
                  )}

                  {/* DESCRIPTION INPUT */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <textarea
                      value={editedSessionDescription}
                      onChange={(e) => setEditedSessionDescription(e.target.value)}
                      className="input-field resize-none field-sizing-content"
                      placeholder="Session description..."
                      rows={2}
                    />
                  </div>

                  {/* REVIEW INPUT */}
                  <div>
                    <label className="text-secondary">Review</label>
                    <textarea
                      value={editedSessionReview}
                      onChange={(e) => setEditedSessionReview(e.target.value)}
                      className="input-field resize-none field-sizing-content"
                      placeholder="How did it go? Note any achievements, injuries, or areas to improve..."
                      rows={2}
                    />
                  </div>

                </>
              ) : (
                <>

                  {/* ACTIVE DURATION TIMER */}
                  {isInProgress && (
                    <div>
                      <label className="text-secondary">Duration</label>
                      <SessionTimer startedAt={timerStart!} offsetSeconds={timerOffset} />
                    </div>
                  )}

                  {/* INACTIVE DURATION TIMER */}
                  {session.is_completed && session.duration != null && (
                    <div>
                      <label className="text-secondary">Duration</label>
                      <div className="flex items-center gap-1.5">
                        <Timer className="w-4 h-4" />
                        <span className="font-mono font-medium">{formatDuration(session.duration)}</span>
                      </div>
                    </div>
                  )}

                  {/* DATE COMPLETED */}
                  {session.started_at && (
                    <div>
                      <label className="text-secondary">Date</label>
                      <p className="text-primary">{formatDateLong(session.started_at)}</p>
                    </div>
                  )}

                  {/* EXERCISE COUNT */}
                  <div>
                    <label className="text-secondary">Exercises</label>
                    <p className="text-primary">{completedSegmentCount}/{totalSegmentCount}</p>
                  </div>

                  {/* DAY ARCHETYPE — the assigned engine day archetype, surfaced as a plain labeled readout. Previously the
                      name was only visible (truncated) inside the Engine Generation picker, so on mobile the user couldn't
                      tell which day archetype the session belonged to. */}
                  {session.day_archetype_name && (
                    <div>
                      <label className="text-secondary">Day Archetype</label>
                      <p className="text-primary break-words">{session.day_archetype_name}</p>

                      {/* GENERATED — when the engine last built this session's targets, so the plan's age is
                          always readable here, not only once it crosses the staleness threshold above. */}
                      {engineGeneratedAt !== null && (
                        <p className={`text-sm break-words ${isGenerationStale ? "text-alert-yellow" : "text-secondary"}`}>
                          Generated {formatLastUsed(new Date(engineGeneratedAt))}
                        </p>
                      )}
                    </div>
                  )}

                  {/* PRE-WORKOUT SURVEY */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-secondary">Pre-Workout</label>

                      {/* EDIT PRE-WORKOUT BUTTON */}
                      <Button
                        className="btn-link"
                        onClick={() => openPreWorkout(0)}
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>{preSurvey && (preSurvey.muscles.length > 0 || preSurvey.notes) ? "Edit" : "Add"}</span>
                      </Button>
                    </div>

                    {/* SURVEY SUMMARY */}
                    {preSurvey && (preSurvey.muscles.length > 0 || preSurvey.notes) ? (
                      <div className="flex flex-col gap-1">

                        {/* MUSCLE FATIGUE LIST */}
                        {preSurvey.muscles.length > 0 && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {preSurvey.muscles.map((m) => (
                              <span key={m.muscle_group_id} className="text-primary text-sm">
                                {m.muscle_group_name}: <span className="font-mono">{m.fatigue}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* SURVEY NOTES */}
                        {preSurvey.notes && (
                          <p className="text-primary whitespace-pre-wrap break-words">{preSurvey.notes}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-secondary">No survey recorded</p>
                    )}
                  </div>

                  {/* SESSION DESCRIPTION */}
                  <div>
                    <label className="text-secondary">Description</label>
                    {session.description && (
                      <p className="text-primary whitespace-pre-wrap break-words">{session.description}</p>
                    )}
                  </div>

                  {/* SESSION REVIEW */}
                  {session.review && (
                    <div>
                      <label className="text-secondary">Review</label>
                      <p className="text-primary whitespace-pre-wrap break-words">{session.review}</p>
                    </div>
                  )}

                  {/* SESSION ANALYSIS */}
                  {session.is_completed && (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-secondary">Analysis</label>

                        {/* ANALYZE BUTTON */}
                        <Button
                          className="btn-link"
                          onClick={handleAnalyzeSession}
                          disabled={isAnalyzing}
                        >
                          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          <span>{isAnalyzing ? "Analyzing..." : session.analysis ? "Regenerate" : "Analyze"}</span>
                        </Button>
                      </div>
                      {session.analysis && (
                        <p className="text-primary whitespace-pre-wrap break-words">{session.analysis}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — the wide grid child (1.5fr track): Engine Generation card stacked above the Exercises card.
              On mobile the flex-col collapses so the order is Session Info → Engine Generation → Exercises. */}
          <div className="flex flex-col gap-6">

            {/* ENGINE GENERATION CARD — its own card, always shown regardless of the Session Info edit/view state
                (deterministic engine — pick a day archetype + generate). Refresh both the session record AND the
                segments, since generation writes new target segments. */}
            <SessionEngineControls sessionId={id} currentArchetypeId={session?.day_archetype_id ?? null} currentArchetypeName={session?.day_archetype_name ?? null} onGenerated={() => { void fetchSession(); void fetchSegments(); }} />

          {/* SEGMENTS CARD — sits below the Engine Generation card in the right column. The Pre-Workout action moved to the sticky bottom bar. */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">Exercises</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {loggedSegments.length === 0 && targetSegments.length === 0 && (

                // GENERATE EXERCISES UI
                <div className="flex flex-col gap-3">

                  {/* ARCHETYPE SLOT PLACEHOLDERS — preview of the unfilled engine slots for the assigned day
                      archetype. Non-interactive; "Assign & Generate" (Engine Generation card) fills them with real exercises.
                      Split into Warmup / Working groups using the same expandable-card component as the post-generation
                      layout, so grouping/collapsing behavior doesn't change once the engine fills the slots. */}
                  {session.day_archetype_id && archetypeSlots.length > 0 && (
                    <div className="flex flex-col gap-3">

                      {/* WARMUP SLOT GROUP — same expandable-card component as the generated Warmup section */}
                      {warmupArchetypeSlots.length > 0 && (
                        <div
                          className={`expandable-card ${isWarmupExpanded ? "expandable-card-open" : "py-1"}`}
                        >

                          {/* WARMUP SLOT GROUP TOGGLE */}
                          <div
                            className="expandable-card-toggle"
                            onClick={() => setIsWarmupExpanded(!isWarmupExpanded)}
                          >
                            <h3 className="text-h3">Warmup</h3>
                            {isWarmupExpanded ? (
                              <ChevronUp className="w-5 h-5 text-muted" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-muted" />
                            )}
                          </div>

                          {/* WARMUP SLOT GROUP EXPANDED CONTENT */}
                          {isWarmupExpanded && (
                            <div className="expandable-card-content">

                              {/* WARMUP SLOT PLACEHOLDER SUB-CARDS (ordered) */}
                              {warmupArchetypeSlots.map((slot) => (

                                // SLOT PLACEHOLDER SUB-CARD
                                <div key={slot.id} className="sub-card relative opacity-75">

                                  {/* SUB-CARD HEADER */}
                                  <div className="sub-card-header">

                                    {/* SLOT MUSCLE / ROLE */}
                                    <div className="flex items-center gap-2">
                                      <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                                      <h3 className="text-card-title capitalize">{slot.pinned_exercise_name ?? slot.target_muscle_name ?? slot.role}</h3>

                                      {/* OPTIONAL INDICATOR */}
                                      {slot.is_optional && (
                                        <span className="badge-gray">optional</span>
                                      )}
                                    </div>

                                    {/* SLOT ROLE BADGE — matches the generated-segment badge placement (pinned bottom-right) */}
                                    <span className="badge-gray capitalize absolute bottom-3 right-3">{slot.role}</span>
                                  </div>

                                  {/* SUB-CARD CONTENT */}
                                  <div className="sub-card-content">

                                    {/* PRESCRIPTION SUMMARY */}
                                    <p className="text-secondary">
                                      {formatSlotDose(slot)}
                                      {slot.target_rpe != null && <span> @ {slot.target_rpe}RPE</span>}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* WORKING SLOT GROUP LABEL */}
                      {warmupArchetypeSlots.length > 0 && (
                        <h3 className="text-h3">Working</h3>
                      )}

                      {/* WORKING SLOT PLACEHOLDER SUB-CARDS (ordered) */}
                      {workingArchetypeSlots.map((slot) => (

                        // SLOT PLACEHOLDER SUB-CARD
                        <div key={slot.id} className="sub-card relative opacity-75">

                          {/* SUB-CARD HEADER */}
                          <div className="sub-card-header">

                            {/* SLOT MUSCLE / ROLE */}
                            <div className="flex items-center gap-2">
                              <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                              <h3 className="text-card-title capitalize">{slot.pinned_exercise_name ?? slot.target_muscle_name ?? slot.role}</h3>

                              {/* OPTIONAL INDICATOR */}
                              {slot.is_optional && (
                                <span className="badge-gray">optional</span>
                              )}
                            </div>

                            {/* SLOT ROLE BADGE — matches the generated-segment badge placement (pinned bottom-right) */}
                            <span className="badge-gray capitalize absolute bottom-3 right-3">{slot.role}</span>
                          </div>

                          {/* SUB-CARD CONTENT */}
                          <div className="sub-card-content">

                            {/* PRESCRIPTION SUMMARY */}
                            <p className="text-secondary">
                              {formatSlotDose(slot)}
                              {slot.target_rpe != null && <span> @ {slot.target_rpe}RPE</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* NO-ARCHETYPE HINT — engine generation lives in the Engine Generation card; point the user there
                      when there's nothing to preview yet (no archetype assigned). */}
                  {!(session.day_archetype_id && archetypeSlots.length > 0) && (
                    <p className="text-secondary text-sm">Assign a day archetype and generate from the Engine Generation panel, or add exercises manually below.</p>
                  )}
                </div>
              )}

              {/* WARMUP SECTION — collapsible list of warmup segments/targets. Also surfaced inside the
                  Pre-Workout wizard; kept here on the page so warmups stay visible/editable without opening it. */}
              {hasWarmupSection && (
                <div
                  className={`expandable-card ${isWarmupExpanded ? "expandable-card-open" : "py-1"}`}
                >

                  {/* WARMUP SECTION TOGGLE */}
                  <div
                    className="expandable-card-toggle"
                    onClick={() => setIsWarmupExpanded(!isWarmupExpanded)}
                  >
                    <h3 className="text-h3">Warmup</h3>
                    {isWarmupExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted" />
                    )}
                  </div>

                  {/* WARMUP EXPANDED CONTENT */}
                  {isWarmupExpanded && (
                    <div className="expandable-card-content">

                      {/* WARMUP EXERCISE SUB-CARDS (interleaved logged + unlinked targets by order) */}
                      {combinedWarmupItems.map((item) => {
                        if (item.type === 'logged') {
                          const segment = item.segment;
                          return (

                            // WARMUP SEGMENT SUB-CARD
                            <div
                              key={item.key}
                              className="sub-card cursor-pointer"
                              onClick={() => handleOpenSegment(segment)}
                            >

                              {/* SUB-CARD HEADER */}
                              <div className="sub-card-header">

                                {/* EXERCISE NAME */}
                                <div className="flex items-center gap-2">
                                  {isSegmentComplete(segment)
                                    ? <CircleCheck className="icon-green !w-4 !h-4 shrink-0" />
                                    : <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                                  }
                                  <h3 className="text-card-title">{segment.exercise_name}</h3>
                                </div>

                                {/* SWAPPED EXERCISE INDICATOR */}
                                {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                                  <ArrowLeftRight className="icon-gray !w-4 !h-4 shrink-0" />
                                )}
                              </div>

                              {/* SUB-CARD CONTENT */}
                              <div className="sub-card-content">

                                {/* SEGMENT NOTES */}
                                {segment.notes && (
                                  <div className="text-secondary flex items-start gap-1">
                                    <StickyNote className="w-3 h-3 shrink-0 mt-1" />
                                    <span className="break-words whitespace-pre-wrap">{segment.notes}</span>
                                  </div>
                                )}

                                {/* SETS */}
                                {(() => {
                                  // Build a unified list ordered by set_number: show logged if it has data, otherwise show target.
                                  const isSwapped = segment.target && segment.target.exercise_id !== segment.exercise_id;
                                  const targetSets = segment.target?.sets ?? [];
                                  const allSetNumbers = [...new Set([
                                    ...segment.sets.map(s => s.set_number),
                                    ...targetSets.map(ts => ts.set_number),
                                  ])].sort((a, b) => a - b);

                                  const rows = allSetNumbers.map(num => {
                                    const logged = segment.sets.find(s => s.set_number === num);
                                    const target = targetSets.find(ts => ts.set_number === num && ts.is_warmup === (logged?.is_warmup ?? true));
                                    const useLogged = logged && (logged.is_completed || hasSetData(logged));
                                    return { num, logged: useLogged ? logged : null, target: !useLogged ? target : null };
                                  }).filter(r => r.logged || r.target);

                                  return rows.length === 0 ? (

                                    // NO SETS PLACEHOLDER
                                    <p className="text-secondary">No sets recorded</p>
                                  ) : (

                                    // SETS
                                    <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">
                                      {rows.map((row) => row.logged ? (

                                        // LOGGED SET ROW
                                        <p key={row.num} className={!row.logged.is_completed ? 'text-secondary' : ''}>
                                          <span>{row.logged.time_seconds != null && row.logged.time_seconds > 0
                                            ? <>{row.logged.weight > 0 ? `${row.logged.weight}lb x ` : ""}{row.logged.time_seconds < 60 ? `${row.logged.time_seconds}s` : `${Math.floor(row.logged.time_seconds / 60)}:${String(row.logged.time_seconds % 60).padStart(2, "0")}`}</>
                                            : <>{row.logged.weight > 0 ? `${row.logged.weight}lb` : "BW"} x {row.logged.reps}</>
                                          }</span>
                                          {row.logged.rpe !== null && <span> @ {row.logged.rpe}RPE</span>}
                                          {row.logged.notes && <span className="text-secondary break-words whitespace-pre-wrap"> - {row.logged.notes}</span>}
                                        </p>
                                      ) : row.target ? (

                                        // TARGET SET ROW
                                        <p key={row.num} className="text-secondary">
                                          <span>{row.target.time_seconds != null && row.target.time_seconds > 0
                                            ? <>{!isSwapped && row.target.weight > 0 ? `${row.target.weight}lb x ` : ""}{row.target.time_seconds < 60 ? `${row.target.time_seconds}s` : `${Math.floor(row.target.time_seconds / 60)}:${String(row.target.time_seconds % 60).padStart(2, "0")}`}</>
                                            : isSwapped
                                              ? <>{row.target.reps} reps</>
                                              : <>{row.target.weight > 0 ? `${row.target.weight}lb` : "BW"} x {row.target.reps}</>
                                          }</span>
                                          {row.target.rpe !== null && <span> @ {row.target.rpe}RPE</span>}
                                        </p>
                                      ) : null)}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        }

                        const target = item.target;
                        return (

                          // WARMUP TARGET SUB-CARD
                          <div
                            key={item.key}
                            className="sub-card cursor-pointer"
                            onClick={() => handleOpenTargetSegment(target)}
                          >

                            {/* SUB-CARD HEADER */}
                            <div className="sub-card-header">

                              {/* EXERCISE NAME */}
                              <div className="flex items-center gap-2">
                                <Circle className="icon-gray !w-4 !h-4" />
                                <h3 className="text-card-title">{target.exercise_name}</h3>
                              </div>
                            </div>

                            {/* SUB-CARD CONTENT */}
                            <div className="sub-card-content">

                              {/* TARGET SETS */}
                              {target.sets.length === 0 ? (

                                // NO SETS PLACEHOLDER
                                <p className="text-secondary">No target sets</p>
                              ) : (

                                // SETS
                                <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">
                                  {target.sets.map((set) => (
                                    <p key={`${set.is_warmup ? 'w' : 's'}-${set.set_number}`} className="text-secondary">
                                      <span>{set.time_seconds != null && set.time_seconds > 0
                                        ? <>{set.weight > 0 ? `${set.weight}lb x ` : ""}{set.time_seconds < 60 ? `${set.time_seconds}s` : `${Math.floor(set.time_seconds / 60)}:${String(set.time_seconds % 60).padStart(2, "0")}`}</>
                                        : <>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</>
                                      }</span>
                                      {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* ADD WARMUP SEGMENT BUTTON */}
                      <Button
                        onClick={handleAddWarmupSegment}
                        className="btn-link"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Warmup Exercise</span>
                      </Button>

                    </div>
                  )}

                </div>
              )}

              {/* WORKING SECTION LABEL — only shown when a warmup section precedes it, to separate the two. */}
              {hasWarmupSection && (
                <h3 className="text-h3">Working</h3>
              )}

              {/* WORKING EXERCISE SUB-CARDS (interleaved logged + unlinked targets by order) */}
              {combinedWorkingItems.map((item) => {
                if (item.type === 'logged') {
                  const segment = item.segment;
                  return (

                    // WORKING SEGMENT SUB-CARD
                    <div
                      key={item.key}
                      className="sub-card cursor-pointer relative"
                      onClick={() => handleOpenSegment(segment)}
                    >

                      {/* SUB-CARD HEADER */}
                      <div className="sub-card-header">

                        {/* EXERCISE NAME */}
                        <div className="flex items-center gap-2">
                          {isSegmentComplete(segment)
                            ? <CircleCheck className="icon-green !w-4 !h-4 shrink-0" />
                            : <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                          }
                          <h3 className="text-card-title">{segment.exercise_name}</h3>

                          {/* SLOT ROLE BADGE — the day-archetype slot this exercise came from (pinned bottom-right) */}
                          {segment.target?.slot_role && (
                            <span className="badge-gray capitalize absolute bottom-3 right-3">{segment.target.slot_role}</span>
                          )}
                        </div>

                        {/* SWAPPED EXERCISE INDICATOR */}
                        {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                          <ArrowLeftRight className="icon-gray !w-4 !h-4 shrink-0" />
                        )}
                      </div>

                      {/* SUB-CARD CONTENT */}
                      <div className="sub-card-content">

                        {/* SEGMENT NOTES */}
                        {segment.notes && (
                          <div className="text-secondary flex items-start gap-1">
                            <StickyNote className="w-3 h-3 shrink-0 mt-1" />
                            <span className="break-words whitespace-pre-wrap">{segment.notes}</span>
                          </div>
                        )}

                        {/* SETS */}
                        {(() => {
                          // Build a unified list ordered by set_number: show logged if it has data, otherwise show target.
                          // Warmup and working sets each have their own set_number sequence, so unify each kind
                          // separately and render warmups first (prefixed "W") — matching the warmup/working split elsewhere.
                          const isSwapped = segment.target && segment.target.exercise_id !== segment.exercise_id;

                          // ROW BUILDER — unify logged + target sets of one kind (warmup or working) by set_number
                          const buildRows = (isWarmup: boolean) => {
                            const loggedSets = segment.sets.filter((s) => s.is_warmup === isWarmup);
                            const targetSets = segment.target?.sets.filter((ts) => ts.is_warmup === isWarmup) ?? [];
                            const setNumbers = [...new Set([
                              ...loggedSets.map(s => s.set_number),
                              ...targetSets.map(ts => ts.set_number),
                            ])].sort((a, b) => a - b);
                            return setNumbers.map(num => {
                              const logged = loggedSets.find(s => s.set_number === num);
                              const target = targetSets.find(ts => ts.set_number === num);
                              const useLogged = logged && (logged.is_completed || hasSetData(logged));
                              return { num, isWarmup, logged: useLogged ? logged : null, target: !useLogged ? target : null };
                            }).filter(r => r.logged || r.target);
                          };

                          // WARMUPS FIRST, THEN WORKING SETS
                          const rows = [...buildRows(true), ...buildRows(false)];

                          return rows.length === 0 ? (

                            // NO SETS PLACEHOLDER
                            <p className="text-secondary">No sets recorded</p>
                          ) : (

                            // SETS — keyed by set identity (kind + number), never by record id: a logged set and
                            // its target carry the SAME id for engine-planned sets, so id keys can collide here.
                            <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">
                              {rows.map((row) => row.logged ? (

                                // WORKING / WARMUP SET ROW — warmups distinguished by a lighter font weight
                                <p key={`${row.isWarmup ? 'w' : 's'}-${row.num}`} className={`${row.isWarmup ? 'font-extralight ' : ''}${!row.logged.is_completed ? 'text-secondary' : ''}`}>
                                  <span>{row.logged.time_seconds != null && row.logged.time_seconds > 0
                                    ? <>{row.logged.weight > 0 ? `${row.logged.weight}lb x ` : ""}{row.logged.time_seconds < 60 ? `${row.logged.time_seconds}s` : `${Math.floor(row.logged.time_seconds / 60)}:${String(row.logged.time_seconds % 60).padStart(2, "0")}`}</>
                                    : <>{row.logged.weight > 0 ? `${row.logged.weight}lb` : "BW"} x {row.logged.reps}</>
                                  }</span>
                                  {row.logged.rpe !== null && <span> @ {row.logged.rpe}RPE</span>}
                                  {row.logged.notes && <span className="text-secondary break-words whitespace-pre-wrap"> - {row.logged.notes}</span>}
                                </p>
                              ) : row.target ? (

                                // TARGET SET ROW — warmups distinguished by a lighter font weight
                                <p key={`${row.isWarmup ? 'w' : 's'}-${row.num}`} className={`text-secondary${row.isWarmup ? ' font-extralight' : ''}`}>
                                  <span>{row.target.time_seconds != null && row.target.time_seconds > 0
                                    ? <>{!isSwapped && row.target.weight > 0 ? `${row.target.weight}lb x ` : ""}{row.target.time_seconds < 60 ? `${row.target.time_seconds}s` : `${Math.floor(row.target.time_seconds / 60)}:${String(row.target.time_seconds % 60).padStart(2, "0")}`}</>
                                    : isSwapped
                                      ? <>{row.target.reps} reps</>
                                      : <>{row.target.weight > 0 ? `${row.target.weight}lb` : "BW"} x {row.target.reps}</>
                                  }</span>
                                  {row.target.rpe !== null && <span> @ {row.target.rpe}RPE</span>}
                                </p>
                              ) : null)}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                }

                const target = item.target;
                return (

                  // WORKING TARGET SUB-CARD
                  <div
                    key={item.key}
                    className="sub-card cursor-pointer relative"
                    onClick={() => handleOpenTargetSegment(target)}
                  >

                    {/* SUB-CARD HEADER */}
                    <div className="sub-card-header">

                      {/* EXERCISE NAME */}
                      <div className="flex items-center gap-2">
                        <Circle className="icon-gray !w-4 !h-4" />
                        <h3 className="text-card-title">{target.exercise_name}</h3>

                        {/* SLOT ROLE BADGE — the day-archetype slot this exercise came from (pinned bottom-right) */}
                        {target.slot_role && (
                          <span className="badge-gray capitalize absolute bottom-3 right-3">{target.slot_role}</span>
                        )}
                      </div>
                    </div>

                    {/* SUB-CARD CONTENT */}
                    <div className="sub-card-content">

                      {/* TARGET SETS */}
                      {target.sets.length === 0 ? (

                        // NO SETS PLACEHOLDER
                        <p className="text-secondary">No target sets</p>
                      ) : (

                        // SETS
                        <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">

                          {/* SET ROWS — warmups (prefixed "W") first, then working; query already orders is_warmup DESC, set_number */}
                          {target.sets.map((set) => (
                            <p key={`${set.is_warmup ? 'w' : 's'}-${set.set_number}`} className={`text-secondary${set.is_warmup ? ' font-extralight' : ''}`}>
                              <span>{set.time_seconds != null && set.time_seconds > 0
                                ? <>{set.weight > 0 ? `${set.weight}lb x ` : ""}{set.time_seconds < 60 ? `${set.time_seconds}s` : `${Math.floor(set.time_seconds / 60)}:${String(set.time_seconds % 60).padStart(2, "0")}`}</>
                                : <>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</>
                              }</span>
                              {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ADD SEGMENT BUTTON */}
              <Button
                onClick={handleAddSegment}
                className="btn-link"
              >
                <Plus className="w-4 h-4" />
                <span>Add Exercise</span>
              </Button>
            </div>
          </div>
          </div>
        </div>
      </main>

      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="bottom-action-bar">

        {/* ACTION GROUP — Pre-Workout paired with the primary start/finish/resume action. Mobile: stacked full-width so the labels never cramp at narrow phone widths; desktop: side by side, centered at natural width. */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-center">

          {/* PRE-WORKOUT BUTTON — high-traffic, used every session; opens the wizard at the warmup mini-session. */}
          <Button className="btn-off w-full sm:w-auto" onClick={() => openPreWorkout(1)}>
            <Dumbbell className="w-4 h-4" />
            <span>Pre-Workout</span>
          </Button>

          {session.is_completed ? (

            // RESUME WORKOUT BUTTON
            <Button className="btn-link w-full sm:w-auto" onClick={handleResumeSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {isUpdatingStatus ? "Resuming..." : "Resume Workout"}
            </Button>
          ) : session.is_current && (session.started_at || session.resumed_at) ? (

            // FINISH WORKOUT BUTTON
            <Button className="btn-blue w-full sm:w-auto" onClick={handleCompleteSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
              {isUpdatingStatus ? "Saving..." : "Finish Workout"}
            </Button>
          ) : (

            // START BUTTON
            <Button className="btn-blue w-full sm:w-auto" onClick={handleStartSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isUpdatingStatus ? "Starting..." : "Start Workout"}
            </Button>
          )}
        </div>
      </div>

      {/* REVIEW SESSION MODAL */}
      <ReviewSessionModal
        isOpen={isReviewModalOpen}
        onClose={handleReviewSkip}
        onSubmit={handleReviewSubmit}
        isSaving={isUpdatingStatus}
        initialReview={session?.review}
      />

      {/* DELETE SESSION MODAL */}
      <DeleteSessionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSession}
        sessionName={session?.name || ""}
        isDeleting={isDeletingSession}
      />

      {/* RESET SESSION MODAL */}
      <ResetSessionModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetSession}
        sessionName={session?.name || ""}
        isResetting={isResettingSession}
      />

      {/* PRE-WORKOUT MODAL */}
      <PreWorkoutModal
        isOpen={isPreWorkoutModalOpen}
        onClose={() => {
          setIsPreWorkoutModalOpen(false);
          setIsStartingViaPreWorkout(false);
        }}
        onSaved={(updated) => setPreSurvey(updated)}
        sessionId={id}
        mode={isStartingViaPreWorkout ? "start" : "edit"}
        onContinue={isStartingViaPreWorkout ? handlePreWorkoutContinueToStart : undefined}
        initialStep={preWorkoutInitialStep}
        warmupItems={combinedWarmupItems}
        onAddWarmupSegment={handleAddWarmupSegment}
        onOpenWarmupSegment={handleOpenSegment}
        onOpenWarmupTarget={handleOpenTargetSegment}
        onGenerateExercises={handleGenerateExercises}
        isGenerating={isGenerating}
        canGenerate={!!session?.description?.trim()}
      />

      {/* WORKOUT LOCATION PICKER */}
      <LocationPickerModal
        isOpen={isWorkoutPickerOpen}
        onClose={() => setIsWorkoutPickerOpen(false)}
        onChanged={() => void handleWorkoutLocationChanged()}
        target="working"
        preloadedLocations={locations}
      />

      {/* WARMUP LOCATION PICKER */}
      <LocationPickerModal
        isOpen={isWarmupPickerOpen}
        onClose={() => setIsWarmupPickerOpen(false)}
        onChanged={() => void loadLocations()}
        target="warmup"
        preloadedLocations={locations}
      />

      {/* EXERCISE SUGGESTIONS MODAL */}
      <ExerciseSuggestionsModal
        isOpen={isSuggestionsModalOpen}
        onClose={() => {
          setIsSuggestionsModalOpen(false);
          setPendingSuggestions([]);
        }}
        onAccept={handleAcceptSuggestions}
        suggestions={pendingSuggestions}
        isAccepting={isAcceptingSuggestions}
      />

      {/* EDIT SEGMENT MODAL */}
      <EditSegmentModal
        isOpen={isSegmentModalOpen}
        onClose={() => {
          setIsSegmentModalOpen(false);
          updateSegmentParam(null);

          // Apply optimistic update from last saved segment (avoids UI lag)
          const saved = lastSavedSegmentRef.current;
          if (saved) {
            setLoggedSegments((prev) => {
              const exists = prev.some((s) => s.id === saved.id);
              return exists
                ? prev.map((s) => s.id === saved.id ? saved : s)
                : [...prev, saved];
            });
            lastSavedSegmentRef.current = null;
          }

          // Refresh from DB if no save is in flight (skip if in progress to avoid overwriting optimistic update)
          if (!isSavingRef.current && !pendingSaveRef.current) {
            fetchSegments();
          }
        }}
        onSave={handleSaveSegment}
        onRemove={handleDeleteSegment}
        segment={segmentModalData}
        exercises={exercises}
        isDeleting={isDeletingSegment}
        onExerciseCreated={(exercise) => setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))}
        onExerciseUpdated={(exercise) => setExercises((prev) => prev.map((e) => e.id === exercise.id ? exercise : e).sort((a, b) => a.name.localeCompare(b.name)))}
        navigationSegments={segmentModalData?.is_warmup ? warmupNavSegments : workingNavSegments}
        onNavigate={(nextSegment) => {
          // Apply any in-flight optimistic update for the outgoing segment before switching.
          // Upsert (not just map) so a freshly-logged previously-unlogged segment — e.g. a virtual
          // segment instantiated from a prescribed target — gets ADDED to loggedSegments rather than
          // dropped. Otherwise navigating away then back rebuilds it from the empty target and the
          // logged set disappears.
          const saved = lastSavedSegmentRef.current;
          if (saved) {
            setLoggedSegments((prev) => {
              const exists = prev.some((s) => s.id === saved.id);
              return exists
                ? prev.map((s) => s.id === saved.id ? saved : s)
                : [...prev, saved];
            });
            lastSavedSegmentRef.current = null;
          }
          // Look up the latest copy of the target segment from state so we get the freshest data
          const latest = loggedSegments.find((s) => s.id === nextSegment.id) ?? nextSegment;
          setSegmentModalData(latest);
          updateSegmentParam(latest.id);
        }}
        distanceUnits={distanceUnits}
        onSetCompleted={handleStartRestTimer}
      />

      {/* ADD SEGMENT EXERCISE PICKER */}
      <ExercisePickerModal
        isOpen={isAddPickerOpen}
        onClose={() => setIsAddPickerOpen(false)}
        onSelect={handleAddPickerSelect}
        exercises={exercises}
        onExerciseCreated={(exercise) => setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))}
        onExerciseUpdated={(exercise) => setExercises((prev) => prev.map((e) => e.id === exercise.id ? exercise : e).sort((a, b) => a.name.localeCompare(b.name)))}
        startOnBrowse
      />

      {/* COMPLETE-SESSION CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
