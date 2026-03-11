"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StickyNote, Plus, Circle, CircleCheck, RotateCcw, Play, Loader2, Timer, ArrowLeft, Edit2, Save, Trash2, X, Sparkles, ChevronDown, ChevronUp, ArrowLeftRight } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SegmentWithSets, TargetSegment } from "../../../types/segment";
import { ExerciseSummary } from "../../../types/exercise";
import DeleteSessionModal from "./DeleteSessionModal";
import ResetSessionModal from "./ResetSessionModal";
import EditSegmentModal from "./EditSegmentModal";
import SessionTimer from "../../../components/SessionTimer";
import { formatDuration, formatDateLong, secondsToHHMMSS, hhmmssToSeconds } from "../../../utils/format";
import { generateUUID } from "../../../utils/id";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loggedSegments, setLoggedSegments] = useState<SegmentWithSets[]>([]);
  const [targetSegments, setTargetSegments] = useState<TargetSegment[]>([]);
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);

  // INPUT
  const [editedSessionName, setEditedSessionName] = useState("");
  const [editedSessionDescription, setEditedSessionDescription] = useState("");
  const [editedSessionReview, setEditedSessionReview] = useState("");
  const [editedStartDate, setEditedStartDate] = useState("");
  const [editedDuration, setEditedDuration] = useState("");
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
  const [isDeletingSegment, setIsDeletingSegment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const lastSavedSegmentRef = useRef<SegmentWithSets | null>(null);
  const segmentsForSaveRef = useRef<SegmentWithSets[]>([]);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<SegmentWithSets | null>(null);

  // DERIVED
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



  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewSession = searchParams.get("new") === "true";

  // LOAD DATA
  useEffect(() => {
    fetchSessionData();
    fetchExercises();
  }, [id]);

  // Initialize edit mode for new sessions
  useEffect(() => {
    if (isNewSession && session && !isLoading) {
      handleStartEditSession();
      router.replace(`/modules/golem/ui/session/${id}`, { scroll: false });
    }
  }, [isNewSession, session, isLoading]);

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

  // SESSION INFO HANDLERS
  const handleStartEditSession = () => {
    if (!session) return;
    setEditedSessionName(session.name);
    setEditedSessionDescription(session.description || "");
    setEditedSessionReview(session.review || "");
    if (session.started_at) {
      setEditedStartDate(new Date(session.started_at).toISOString().split("T")[0]);
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
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update session");
        return;
      }

      const updatedSession = await response.json();
      setSession(updatedSession);
    } catch (error) {
      toast.error("Failed to update session");
      console.error("Error updating session:", error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStartSession = () => {
    updateSessionStatus({ is_current: true, started_at: new Date() });
  };

  const handleResumeSession = () => {
    updateSessionStatus({ is_completed: false, is_current: true, resumed_at: new Date() });
  };

  const handleCompleteSession = () => {
    if (!session) return;

    // Check for incomplete working sets and confirm if any exist
    const incompleteWorkingSets = loggedSegments
      .flatMap(seg => seg.sets)
      .filter(s => !s.is_warmup && !s.is_completed);

    if (incompleteWorkingSets.length > 0) {
      const confirmed = window.confirm(
        `You have ${incompleteWorkingSets.length} incomplete working set${incompleteWorkingSets.length > 1 ? "s" : ""}. Complete session anyway?`
      );
      if (!confirmed) return;
    }

    const elapsed = session.resumed_at
      ? (session.duration ?? 0) + Math.floor((Date.now() - new Date(session.resumed_at).getTime()) / 1000)
      : Math.floor((Date.now() - new Date(session.started_at!).getTime()) / 1000);

    updateSessionStatus({
      is_completed: true,
      is_current: false,
      resumed_at: null,
      duration: elapsed,
    });
  };

  // SEGMENT HANDLERS
  const handleOpenSegment = (segment: SegmentWithSets) => {
    setSegmentModalData(segment);
    setIsSegmentModalOpen(true);
  };

  // TODO - Block editing if session not started

  // Initialize a new EditSegmentModal and pass target set data (modal will handle filling out sets[])
  const handleOpenTargetSegment = (target: TargetSegment) => {
    const newSegmentId = generateUUID();
    const groupSegments = target.is_warmup ? warmupLoggedSegments : workingLoggedSegments;
    const newSegment: SegmentWithSets = {
      id: newSegmentId,
      session_id: id,
      exercise_id: target.exercise_id,
      exercise_name: target.exercise_name,
      target_id: target.id,
      order_index: groupSegments.length + 1,
      is_warmup: target.is_warmup,
      modifier_id: null,
      modifier_name: null,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: target.sets.map((ts) => ({
        id: generateUUID(),
        session_segment_id: newSegmentId,
        set_number: ts.set_number,
        is_warmup: ts.is_warmup,
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        is_completed: false,
        created_at: new Date(),
        modified_at: new Date(),
      })),
      target: target,
    };
    setSegmentModalData(newSegment);
    setIsSegmentModalOpen(true);
  };

  const handleAddSegment = () => {
    const segmentId = generateUUID();
    const newSegment: SegmentWithSets = {
      id: segmentId,
      session_id: id,
      exercise_id: "",
      exercise_name: "",
      target_id: null,
      order_index: workingLoggedSegments.length + 1,
      is_warmup: false,
      modifier_id: null,
      modifier_name: null,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: [{
        id: generateUUID(),
        session_segment_id: segmentId,
        set_number: 1,
        is_warmup: false,
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        is_completed: false,
        created_at: new Date(),
        modified_at: new Date(),
      }],
      target: null,
    };
    setSegmentModalData(newSegment);
    setIsSegmentModalOpen(true);
  };

  const handleAddWarmupSegment = () => {
    const segmentId = generateUUID();
    const newSegment: SegmentWithSets = {
      id: segmentId,
      session_id: id,
      exercise_id: "",
      exercise_name: "",
      target_id: null,
      order_index: warmupLoggedSegments.length + 1,
      is_warmup: true,
      modifier_id: null,
      modifier_name: null,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: [{
        id: generateUUID(),
        session_segment_id: segmentId,
        set_number: 1,
        is_warmup: true, // warmup segment sets default to warmup
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        is_completed: false,
        created_at: new Date(),
        modified_at: new Date(),
      }],
      target: null,
    };
    setSegmentModalData(newSegment);
    setIsSegmentModalOpen(true);
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

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate exercises");
        return;
      }

      await fetchSegments();
      toast.success("Exercises generated");
    } catch (error) {
      toast.error("Failed to generate exercises");
      console.error("Error generating exercises:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  // REGENERATE PLAN HANDLER
  const handleRegeneratePlan = async () => {
    setIsRegeneratingPlan(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${id}/regenerate-plan`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to regenerate plan");
        return;
      }

      const updatedSession = await response.json();
      setSession(updatedSession);
      setEditedSessionName(updatedSession.name);
      setEditedSessionDescription(updatedSession.description || "");
      toast.success("Plan regenerated");
    } catch (error) {
      toast.error("Failed to regenerate plan");
      console.error("Error regenerating plan:", error);
    } finally {
      setIsRegeneratingPlan(false);
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

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to analyze session");
        return;
      }

      const updatedSession = await response.json();
      setSession(updatedSession);
      toast.success("Analysis generated");
    } catch (error) {
      toast.error("Failed to analyze session");
      console.error("Error analyzing session:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper: check if a set contains any manually entered data
  const hasSetData = (set: { weight: number; reps: number; rpe: number | null; notes: string | null }) =>
    set.weight > 0 || set.reps > 0 || set.rpe !== null || (set.notes !== null && set.notes !== '');

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

  return (

    // BACKGROUND
    <div className="page pb-16">

      <Toaster position="bottom-center" />

      <main className="page-container">

        {/* BACK BUTTON */}
        <Button className="btn-link mb-2" onClick={() => router.push("/modules/golem/ui/home")}>
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Button>

        {/* HEADER */}
        <div className="mb-4">

          {/* TITLE */}
          <h1 className="text-page-title">{session ? session.name : "Session Not Found"}</h1>
        </div>

        {/* CARDS */}
        <div className="card-container">

          {/* SESSION INFO CARD */}
          {session && (
            <div className="card">

              {/* CARD HEADER */}
              <div className="card-header">

                {/* TITLE */}
                <h2 className="text-card-title">Session Info</h2>

                {/* SESSION ACTION BUTTONS */}
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto sm:h-9">
                  {!isEditingSession ? (

                    // VIEW MODE ACTIONS
                    <>

                      {/* DELETE BUTTON */}
                      <Button className="btn-delete w-full sm:w-auto" onClick={() => setIsDeleteModalOpen(true)}>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </Button>

                      {/* RESET BUTTON */}
                      <Button className="btn-secondary w-full sm:w-auto" onClick={() => setIsResetModalOpen(true)}>
                        <RotateCcw className="w-4 h-4" />
                        <span>Reset</span>
                      </Button>

                      {/* EDIT BUTTON */}
                      <Button className="btn-primary w-full sm:w-auto" onClick={handleStartEditSession}>
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
                      <Button className="btn-success w-full sm:w-auto" onClick={handleSaveSession} disabled={isSavingSession}>
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
                    {session.is_completed && (
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
                    )}

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

                    {/* SESSION DESCRIPTION */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-secondary">Description</label>

                        {/* REGENERATE PLAN BUTTON */}
                        {session.week_id && (
                          <Button
                            className="btn-link"
                            onClick={handleRegeneratePlan}
                            disabled={isRegeneratingPlan}
                          >
                            {isRegeneratingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            <span>{isRegeneratingPlan ? "Regenerating..." : session.description ? "Regenerate Plan" : "Generate Plan"}</span>
                          </Button>
                        )}
                      </div>
                      {session.description && (
                        <p className="text-primary whitespace-pre-wrap break-words">{session.description}</p>
                      )}
                    </div>

                    {/* SESSION REVIEW */}
                    {session.is_completed && session.review && (
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
          )}

          {/* SEGMENTS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">Exercises</h2>

              {/* REGENERATE EXERCISES BUTTON */}
              {(loggedSegments.length > 0 || targetSegments.length > 0) && (
                <Button
                  className="btn-link"
                  onClick={handleGenerateExercises}
                  disabled={isGenerating || !session?.description?.trim()}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{isGenerating ? "Regenerating..." : "Regenerate"}</span>
                </Button>
              )}
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {loggedSegments.length === 0 && targetSegments.length === 0 && (

                // GENERATE EXERCISES UI
                <div className="flex flex-col gap-3">

                  {/* GENERATE BUTTON */}
                  <Button
                    className="btn-primary"
                    onClick={handleGenerateExercises}
                    disabled={isGenerating || !session?.description?.trim()}
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isGenerating ? "Generating..." : "Generate Exercises"}</span>
                  </Button>
                </div>
              )}

              {/* WARMUP SECTION */}
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

                      {/* WARMUP LOGGED SEGMENT SUB-CARDS */}
                      {warmupLoggedSegments.map((segment) => (

                        // WARMUP SEGMENT SUB-CARD
                        <div
                          key={segment.id}
                          className="sub-card cursor-pointer"
                          onClick={() => handleOpenSegment(segment)}
                        >

                          {/* SUB-CARD HEADER */}
                          <div className="sub-card-header">

                            {/* EXERCISE NAME */}
                            <div className="flex items-center gap-2">
                              {isSegmentComplete(segment)
                                ? <CircleCheck className="icon-success !w-4 !h-4 shrink-0" />
                                : <Circle className="icon-muted !w-4 !h-4 shrink-0" />
                              }
                              <h3 className="text-card-title">{segment.exercise_name}</h3>
                            </div>

                            {/* SWAPPED EXERCISE INDICATOR */}
                            {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                              <ArrowLeftRight className="icon-muted !w-4 !h-4 shrink-0" />
                            )}
                          </div>

                          {/* SUB-CARD CONTENT */}
                          <div className="sub-card-content">

                            {/* SEGMENT NOTES */}
                            {segment.notes && (
                              <div className="text-secondary flex items-start gap-1">
                                <StickyNote className="w-3 h-3 shrink-0 mt-1" />
                                <span className="break-all">{segment.notes}</span>
                              </div>
                            )}

                            {/* SETS */}
                            {(() => {
                              // Build a unified list ordered by set_number: show logged if it has data, otherwise show target
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
                                    <p key={row.logged.id} className={!row.logged.is_completed ? 'text-secondary' : ''}>
                                      <span>{row.logged.weight > 0 ? `${row.logged.weight}lb` : "BW"} x {row.logged.reps}</span>
                                      {row.logged.rpe !== null && <span> @ {row.logged.rpe}RPE</span>}
                                      {row.logged.notes && <span className="text-secondary"> - {row.logged.notes}</span>}
                                    </p>
                                  ) : row.target ? (

                                    // TARGET SET ROW
                                    <p key={row.target.id} className="text-secondary">
                                      <span>{row.target.weight > 0 ? `${row.target.weight}lb` : "BW"} x {row.target.reps}</span>
                                      {row.target.rpe !== null && <span> @ {row.target.rpe}RPE</span>}
                                    </p>
                                  ) : null)}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}

                      {/* WARMUP UNLINKED TARGET CARDS */}
                      {warmupUnlinkedTargets.map((target) => (

                        // WARMUP TARGET SUB-CARD
                        <div
                          key={target.id}
                          className="sub-card cursor-pointer"
                          onClick={() => handleOpenTargetSegment(target)}
                        >

                          {/* SUB-CARD HEADER */}
                          <div className="sub-card-header">

                            {/* EXERCISE NAME */}
                            <div className="flex items-center gap-2">
                              <Circle className="icon-muted !w-4 !h-4" />
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
                                  <p key={set.id} className="text-secondary">
                                    <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                                    {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

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

              {/* WORKING SECTION LABEL */}
              {hasWarmupSection && (
                <h3 className="text-h3">Working</h3>
              )}

              {/* WORKING LOGGED SEGMENT SUB-CARDS */}
              {workingLoggedSegments.map((segment) => (

                // WORKING SEGMENT SUB-CARD
                <div
                  key={segment.id}
                  className="sub-card cursor-pointer"
                  onClick={() => handleOpenSegment(segment)}
                >

                  {/* SUB-CARD HEADER */}
                  <div className="sub-card-header">

                    {/* EXERCISE NAME */}
                    <div className="flex items-center gap-2">
                      {isSegmentComplete(segment)
                        ? <CircleCheck className="icon-success !w-4 !h-4 shrink-0" />
                        : <Circle className="icon-muted !w-4 !h-4 shrink-0" />
                      }
                      <h3 className="text-card-title">{segment.exercise_name}</h3>
                    </div>

                    {/* SWAPPED EXERCISE INDICATOR */}
                    {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                      <ArrowLeftRight className="icon-muted !w-4 !h-4 shrink-0" />
                    )}
                  </div>

                  {/* SUB-CARD CONTENT */}
                  <div className="sub-card-content">

                    {/* SEGMENT NOTES */}
                    {segment.notes && (
                      <div className="text-secondary flex items-start gap-1">
                        <StickyNote className="w-3 h-3 shrink-0 mt-1" />
                        <span className="break-all">{segment.notes}</span>
                      </div>
                    )}

                    {/* SETS */}
                    {(() => {
                      // Build a unified list ordered by set_number: show logged if it has data, otherwise show target
                      const workingSets = segment.sets.filter((s) => !s.is_warmup);
                      const workingTargets = segment.target?.sets.filter((ts) => !ts.is_warmup) ?? [];
                      const allSetNumbers = [...new Set([
                        ...workingSets.map(s => s.set_number),
                        ...workingTargets.map(ts => ts.set_number),
                      ])].sort((a, b) => a - b);

                      const rows = allSetNumbers.map(num => {
                        const logged = workingSets.find(s => s.set_number === num);
                        const target = workingTargets.find(ts => ts.set_number === num);
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

                            // WORKING SET ROW
                            <p key={row.logged.id} className={!row.logged.is_completed ? 'text-secondary' : ''}>
                              <span>{row.logged.weight > 0 ? `${row.logged.weight}lb` : "BW"} x {row.logged.reps}</span>
                              {row.logged.rpe !== null && <span> @ {row.logged.rpe}RPE</span>}
                              {row.logged.notes && <span className="text-secondary"> - {row.logged.notes}</span>}
                            </p>
                          ) : row.target ? (

                            // TARGET SET ROW
                            <p key={row.target.id} className="text-secondary">
                              <span>{row.target.weight > 0 ? `${row.target.weight}lb` : "BW"} x {row.target.reps}</span>
                              {row.target.rpe !== null && <span> @ {row.target.rpe}RPE</span>}
                            </p>
                          ) : null)}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* WORKING UNLINKED TARGET CARDS */}
              {workingUnlinkedTargets.map((target) => (

                // WORKING TARGET SUB-CARD
                <div
                  key={target.id}
                  className="sub-card cursor-pointer"
                  onClick={() => handleOpenTargetSegment(target)}
                >

                  {/* SUB-CARD HEADER */}
                  <div className="sub-card-header">

                    {/* EXERCISE NAME */}
                    <div className="flex items-center gap-2">
                      <Circle className="icon-muted !w-4 !h-4" />
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

                        {/* WORKING SET ROWS */}
                        {target.sets.filter((s) => !s.is_warmup).map((set) => (
                          <p key={set.id} className="text-secondary">
                            <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                            {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

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
      </main>

      {/* BOTTOM ACTION BAR */}
      {session && (
        <div className="bottom-action-bar">
          {session.is_completed ? (

            // RESUME WORKOUT BUTTON
            <Button className="btn-link w-full sm:w-auto" onClick={handleResumeSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {isUpdatingStatus ? "Resuming..." : "Resume Workout"}
            </Button>
          ) : session.is_current && (session.started_at || session.resumed_at) ? (

            // COMPLETE BUTTON
            <Button className="btn-primary w-full sm:w-auto" onClick={handleCompleteSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
              {isUpdatingStatus ? "Saving..." : "Complete"}
            </Button>
          ) : (

            // START BUTTON
            <Button className="btn-primary w-full sm:w-auto" onClick={handleStartSession} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isUpdatingStatus ? "Starting..." : "Start Workout"}
            </Button>
          )}
        </div>
      )}

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

      {/* EDIT SEGMENT MODAL */}
      <EditSegmentModal
        isOpen={isSegmentModalOpen}
        onClose={() => {
          setIsSegmentModalOpen(false);

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

          // Refresh from DB to ensure consistency
          fetchSegments();
        }}
        onSave={handleSaveSegment}
        onRemove={handleDeleteSegment}
        segment={segmentModalData}
        exercises={exercises}
        isDeleting={isDeletingSegment}
        onExerciseCreated={(exercise) => setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))}
        onExerciseUpdated={(exercise) => setExercises((prev) => prev.map((e) => e.id === exercise.id ? exercise : e).sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </div>
  );
}
