"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StickyNote, Plus, Circle, CircleCheck, RotateCcw, Play, Loader2, Timer, ArrowLeft, Edit2, Save, Trash2, X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SegmentWithSets, TargetSegment } from "../../../types/segment";
import { ExerciseSummary } from "../../../types/exercise";
import DeleteSessionModal from "./DeleteSessionModal";
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
  const [editedSessionNotes, setEditedSessionNotes] = useState("");
  const [editedStartDate, setEditedStartDate] = useState("");
  const [editedDuration, setEditedDuration] = useState("");
  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [segmentModalData, setSegmentModalData] = useState<SegmentWithSets | null>(null);
  const [isDeletingSegment, setIsDeletingSegment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const lastSavedSegmentRef = useRef<SegmentWithSets | null>(null);
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

  // Sync session notes state
  useEffect(() => {
    if (session) setEditedSessionNotes(session.notes || "");
  }, [session]);

  // Initialize edit mode for new sessions
  useEffect(() => {
    if (isNewSession && session && !isLoading) {
      handleStartEditSession();
      router.replace(`/modules/west/ui/session/${id}`, { scroll: false });
    }
  }, [isNewSession, session, isLoading]);

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
      const response = await fetch(`/modules/west/api/sessions/${id}`);

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
      const response = await fetch(`/modules/west/api/sessions/${id}/segments`);
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
      const response = await fetch("/modules/west/api/exercises?include=muscles");
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

      const response = await fetch(`/modules/west/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedSessionName.trim(),
          notes: session.notes,
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
      const response = await fetch(`/modules/west/api/sessions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to delete session");
        return;
      }

      toast.success("Session deleted");
      router.back();
    } catch (error) {
      toast.error("Failed to delete session");
      console.error("Error deleting session:", error);
    }
  };

  // STATUS HANDLERS
  const updateSessionStatus = async (overrides: Partial<WorkoutSession>) => {
    if (!session) return;
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/modules/west/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: session.name,
          notes: session.notes,
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
      // Check if segment already exists in the list
      const existingIndex = loggedSegments.findIndex(ex => ex.id === editedSegment.id);
      let updatedSegments: SegmentWithSets[];

      if (existingIndex >= 0) {
        // Replace existing segment
        updatedSegments = loggedSegments.map(ex =>
          ex.id === editedSegment.id ? editedSegment : ex
        );
      } else {
        // Add new segment
        updatedSegments = [...loggedSegments, editedSegment];
      }

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

      const response = await fetch(`/modules/west/api/sessions/${id}/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filteredSegments),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to save");
      }
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
      const response = await fetch(`/modules/west/api/sessions/${id}/segments`, {
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
    if (!session?.notes?.trim()) {
      toast.error("Session notes are required for generation");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/modules/west/api/sessions/${id}/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate exercises");
        return;
      }

      const data = await response.json();
      setLoggedSegments(data.exercises);
      setTargetSegments(data.targets);
      toast.success("Exercises generated");
    } catch (error) {
      toast.error("Failed to generate exercises");
      console.error("Error generating exercises:", error);
    } finally {
      setIsGenerating(false);
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

      <Toaster />

      <main className="page-container">

        {/* BACK BUTTON */}
        <Button className="btn-link mb-2" onClick={() => router.back()}>
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
                            className="input-field !min-w-10 sm:max-w-20 !px-2 text-center"
                          />
                          <span className="text-muted font-medium">h</span>

                          {/* MINUTES */}
                          <input
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
                            className="input-field !min-w-10 sm:max-w-20 !px-2 text-center"
                          />
                          <span className="text-muted font-medium">m</span>

                          {/* SECONDS */}
                          <input
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

                    {/* SESSION NOTES */}
                    <div>
                      <label className="text-secondary">Notes</label>
                      <textarea
                        value={editedSessionNotes}
                        onChange={(e) => {
                          setEditedSessionNotes(e.target.value);
                          const el = e.target;
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }}
                        onBlur={(e) => {
                          const trimmed = e.target.value.trim() || null;
                          if (trimmed !== (session.notes || null)) {
                            updateSessionStatus({ notes: trimmed });
                          }
                        }}
                        className="input-field resize-none overflow-hidden"
                        placeholder="Session notes..."
                        rows={1}
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }
                        }}
                      />
                    </div>
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
                    disabled={isGenerating || !session?.notes?.trim()}
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
                                ? <CircleCheck className="icon-success !w-4 !h-4" />
                                : <Circle className="icon-muted !w-4 !h-4" />
                              }
                              <h3 className="text-card-title">{segment.exercise_name}</h3>
                            </div>

                            {/* ORIGINAL TARGET EXERCISE HINT (when selected exercise was swapped) */}
                            {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                              <p className="text-secondary">Swapped from {segment.target.exercise_name}</p>
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
                              const unlinkedTargetSets = segment.target
                                ? segment.target.sets.filter((ts) => !segment.sets.some((s) => s.set_number === ts.set_number && s.is_warmup === ts.is_warmup))
                                : [];
                              const hasContent = segment.sets.length > 0 || unlinkedTargetSets.length > 0;

                              return !hasContent ? (

                                // NO SETS PLACEHOLDER
                                <p className="text-secondary">No sets recorded</p>
                              ) : (

                                // SETS
                                <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">

                                  {/* LOGGED SET ROWS */}
                                  {segment.sets.map((set) => (
                                    <p key={set.id} className={!set.is_completed ? 'text-secondary' : ''}>
                                      <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                                      {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                      {set.notes && <span className="text-secondary"> - {set.notes}</span>}
                                    </p>
                                  ))}

                                  {/* UNLINKED TARGET SET ROWS */}
                                  {unlinkedTargetSets.map((ts) => (
                                    <p key={ts.id} className="text-secondary">
                                      <span>{ts.weight > 0 ? `${ts.weight}lb` : "BW"} x {ts.reps}</span>
                                      {ts.rpe !== null && <span> @ {ts.rpe}RPE</span>}
                                    </p>
                                  ))}
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
                        ? <CircleCheck className="icon-success !w-4 !h-4" />
                        : <Circle className="icon-muted !w-4 !h-4" />
                      }
                      <h3 className="text-card-title">{segment.exercise_name}</h3>
                    </div>

                    {/* ORIGINAL TARGET EXERCISE HINT (when selected exercise was swapped) */}
                    {segment.target && segment.target.exercise_id !== segment.exercise_id && (
                      <p className="text-secondary">Swapped from {segment.target.exercise_name}</p>
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
                      const workingSets = segment.sets.filter((s) => !s.is_warmup);
                      const unlinkedWorkingTargets = segment.target
                        ? segment.target.sets.filter((ts) => !ts.is_warmup && !workingSets.some((s) => s.set_number === ts.set_number))
                        : [];
                      const hasContent = workingSets.length > 0 || unlinkedWorkingTargets.length > 0;

                      return !hasContent ? (

                        // NO SETS PLACEHOLDER
                        <p className="text-secondary">No sets recorded</p>
                      ) : (

                        // SETS
                        <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">

                          {/* WORKING SET ROWS */}
                          {workingSets.map((set) => {
                            const targetSet = segment.target
                              ? segment.target.sets.find((ts) => ts.set_number === set.set_number && !ts.is_warmup)
                              : null;
                            const targetDiffers = targetSet && (
                              set.weight !== targetSet.weight || set.reps !== targetSet.reps || set.rpe !== targetSet.rpe
                            );

                            return (
                              // WORKING SET ROW
                              <p key={set.id} className={!set.is_completed ? 'text-secondary' : ''}>
                                <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                                {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                {targetDiffers && !set.is_completed && set.weight === 0 && set.reps === 0 && <span className="text-secondary"> · {targetSet.weight} x {targetSet.reps}{targetSet.rpe !== null ? ` @ ${targetSet.rpe}` : ""}</span>}
                                {set.notes && <span className="text-secondary"> - {set.notes}</span>}
                              </p>
                            );
                          })}

                          {/* UNLINKED WORKING TARGET ROWS */}
                          {unlinkedWorkingTargets.map((ts) => (
                            <p key={ts.id} className="text-secondary">
                              <span>{ts.weight > 0 ? `${ts.weight}lb` : "BW"} x {ts.reps}</span>
                              {ts.rpe !== null && <span> @ {ts.rpe}RPE</span>}
                            </p>
                          ))}
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

      {/* EDIT SEGMENT MODAL */}
      <EditSegmentModal
        isOpen={isSegmentModalOpen}
        onClose={() => {
          setIsSegmentModalOpen(false);
          const saved = lastSavedSegmentRef.current;
          if (saved) {
            // Apply last auto-saved segment to local state (avoids re-fetch delay)
            setLoggedSegments((prev) => {
              const exists = prev.some((s) => s.id === saved.id);
              if (exists) {
                return prev.map((s) => s.id === saved.id ? saved : s);
              }
              return [...prev, saved];
            });
            lastSavedSegmentRef.current = null;
          }
          // Silent background refresh from DB
          fetchSegments();
        }}
        onSave={handleSaveSegment}
        onRemove={handleDeleteSegment}
        segment={segmentModalData}
        exercises={exercises}
        isDeleting={isDeletingSegment}
        onExerciseCreated={(exercise) => setExercises((prev) => [...prev, {
          id: exercise.id,
          name: exercise.name,
          primary_muscles: [],
          secondary_muscles: [],
          estimated_one_rep_max: null,
        }].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </div>
  );
}
