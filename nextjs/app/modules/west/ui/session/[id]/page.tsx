"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StickyNote, Plus, Circle, CircleCheck, RotateCcw, Play, Loader2, Timer, ArrowLeft, Edit2, Save, Trash2, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SessionExerciseWithSets, TargetSessionExercise } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";
import DeleteSessionModal from "./DeleteSessionModal";
import EditExerciseModal from "./EditExerciseModal";
import SessionTimer from "../../../components/SessionTimer";
import { formatDuration, formatDateLong, secondsToHHMMSS, hhmmssToSeconds } from "../../../utils/format";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loggedSessionExercises, setLoggedSessionExercises] = useState<SessionExerciseWithSets[]>([]);
  const [targetExercises, setTargetSessionExercises] = useState<TargetSessionExercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

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
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [exerciseModalData, setExerciseModalData] = useState<SessionExerciseWithSets | null>(null);
  const [isSavingExercise, setIsSavingExercise] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // DERIVED
  const timerStart = session?.resumed_at ?? session?.started_at ?? null;
  const timerOffset = session?.resumed_at ? (session.duration ?? 0) : 0;
  const isInProgress = !!timerStart && !session?.is_completed;
  const linkedTargetExerciseIds = new Set(loggedSessionExercises.map((e) => e.target_id).filter(Boolean));
  const unlinkedTargetExercises = targetExercises.filter((t) => !linkedTargetExerciseIds.has(t.id));
  const totalExerciseCount = loggedSessionExercises.length + unlinkedTargetExercises.length;



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
      router.replace(`/modules/west/ui/session/${id}`, { scroll: false });
    }
  }, [isNewSession, session, isLoading]);

  const fetchSessionData = async () => {
    setIsLoading(true);
    try {
      const [sessionResponse, exercisesResponse] = await Promise.all([
        fetch(`/modules/west/api/sessions/${id}`),
        fetch(`/modules/west/api/sessions/${id}/exercises`),
      ]);

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        setSession(sessionData);
      }

      if (exercisesResponse.ok) {
        const data = await exercisesResponse.json();
        setLoggedSessionExercises(data.exercises);
        setTargetSessionExercises(data.targets);
      }
    } catch (error) {
      console.error("Error fetching session data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExercises = async () => {
    try {
      const response = await fetch("/modules/west/api/exercises");
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
    setEditedSessionNotes(session.notes || "");
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
    setEditedSessionNotes("");
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
          notes: editedSessionNotes.trim() || null,
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

  // EXERCISE HANDLERS
  const handleOpenExercise = (exercise: SessionExerciseWithSets) => {
    setExerciseModalData(exercise);
    setIsExerciseModalOpen(true);
  };

  // TODO - Block editing if session not started

  // Initialize a new EditExerciseModal and pass target set data (modal will handle filling out sets[])
  const handleOpenTargetExercise = (target: TargetSessionExercise) => {
    const newSessionExerciseId = crypto.randomUUID();
    const newSessionExercise: SessionExerciseWithSets = {
      id: newSessionExerciseId,
      session_id: id,
      exercise_id: target.exercise_id,
      exercise_name: target.exercise_name,
      target_id: target.id,
      order_index: loggedSessionExercises.length + 1,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: target.sets.map((ts) => ({
        id: crypto.randomUUID(),
        session_exercise_id: newSessionExerciseId,
        set_number: ts.set_number,
        is_warmup: ts.is_warmup,
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        created_at: new Date(),
        modified_at: new Date(),
      })),
      target: target,
    };
    setExerciseModalData(newSessionExercise);
    setIsExerciseModalOpen(true);
  };

  const handleAddExercise = () => {
    const exerciseId = crypto.randomUUID();
    const newExercise: SessionExerciseWithSets = {
      id: exerciseId,
      session_id: id,
      exercise_id: "",
      exercise_name: "",
      target_id: null,
      order_index: loggedSessionExercises.length + 1,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: [{
        id: crypto.randomUUID(),
        session_exercise_id: exerciseId,
        set_number: 1,
        is_warmup: false,
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        created_at: new Date(),
        modified_at: new Date(),
      }],
      target: null,
    };
    setExerciseModalData(newExercise);
    setIsExerciseModalOpen(true);
  };

  const handleSaveExercise = async (editedExercise: SessionExerciseWithSets) => {
    setIsSavingExercise(true);
    try {
      // Check if exercise already exists in the list
      const existingIndex = loggedSessionExercises.findIndex(ex => ex.id === editedExercise.id);
      let updatedExercises: SessionExerciseWithSets[];

      if (existingIndex >= 0) {
        // Replace existing exercise
        updatedExercises = loggedSessionExercises.map(ex =>
          ex.id === editedExercise.id ? editedExercise : ex
        );
      } else {
        // Add new exercise
        updatedExercises = [...loggedSessionExercises, editedExercise];
      }

      const response = await fetch(`/modules/west/api/sessions/${id}/exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedExercises),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to save exercise");
        return;
      }

      const data = await response.json();
      setLoggedSessionExercises(data.exercises);
      setTargetSessionExercises(data.targets);
      setIsExerciseModalOpen(false);
      toast.success("Exercise saved");
    } catch (error) {
      toast.error("Failed to save exercise");
      console.error("Error saving exercise:", error);
    } finally {
      setIsSavingExercise(false);
    }
  };

  const handleRemoveExercise = async () => {
    if (!exerciseModalData) return;

    // If the exercise is new (not yet saved), just close the modal
    const exists = loggedSessionExercises.some(ex => ex.id === exerciseModalData.id);
    if (!exists) {
      setIsExerciseModalOpen(false);
      return;
    }

    setIsSavingExercise(true);
    try {
      const updatedExercises = loggedSessionExercises.filter(ex => ex.id !== exerciseModalData.id);
      updatedExercises.forEach((ex, i) => { ex.order_index = i + 1; });

      const response = await fetch(`/modules/west/api/sessions/${id}/exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedExercises),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to remove exercise");
        return;
      }

      const data = await response.json();
      setLoggedSessionExercises(data.exercises);
      setTargetSessionExercises(data.targets);
      setIsExerciseModalOpen(false);
      toast.success("Exercise removed");
    } catch (error) {
      toast.error("Failed to remove exercise");
      console.error("Error removing exercise:", error);
    } finally {
      setIsSavingExercise(false);
    }
  };

  const isExerciseComplete = (exercise: SessionExerciseWithSets): boolean => {
    if (!exercise.target) return true;
    return exercise.target.sets.every((targetSet) =>
      exercise.sets.some((set) => set.set_number === targetSet.set_number && set.is_warmup === targetSet.is_warmup)
    );
  };
  const completedExerciseCount = loggedSessionExercises.filter(isExerciseComplete).length;

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <div className="page-container">
          <div className="flex justify-center items-center py-12">
            <div className="text-page-subtitle">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (

    // BACKGROUND
    <div className="page">

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

                    {/* NOTES INPUT */}
                    <div>
                      <label className="text-secondary">Notes</label>
                      <input
                        type="text"
                        value={editedSessionNotes}
                        onChange={(e) => setEditedSessionNotes(e.target.value)}
                        className="input-field"
                        placeholder="Session notes..."
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
                      <p className="text-primary">{completedExerciseCount}/{totalExerciseCount}</p>
                    </div>

                    {/* SESSION NOTES */}
                    {session.notes && (
                      <div>
                        <label className="text-secondary">Notes</label>
                        <p className="text-primary">{session.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* EXERCISES CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">Exercises ({completedExerciseCount}/{totalExerciseCount})</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {loggedSessionExercises.length === 0 && targetExercises.length === 0 && (

                // EMPTY STATE
                <p className="table-empty">No exercises added in this session</p>
              )}

              {/* LOGGED EXERCISE SUB-CARDS */}
              {loggedSessionExercises.map((exercise) => (

                // EXERCISE SUB-CARD
                <div
                  key={exercise.id}
                  className="sub-card cursor-pointer"
                  onClick={() => handleOpenExercise(exercise)}
                >

                  {/* SUB-CARD HEADER */}
                  <div className="sub-card-header">

                    {/* EXERCISE NAME */}
                    <div className="flex items-center gap-2">
                      {isExerciseComplete(exercise)
                        ? <CircleCheck className="icon-success !w-4 !h-4" />
                        : <Circle className="icon-muted !w-4 !h-4" />
                      }
                      <h3 className="text-card-title">{exercise.exercise_name}</h3>
                    </div>

                    {/* ORIGINAL TARGET EXERCISE HINT (when selected exercise was swapped) */}
                    {exercise.target && exercise.target.exercise_id !== exercise.exercise_id && (
                      <p className="text-secondary">Swapped from {exercise.target.exercise_name}</p>
                    )}
                  </div>

                  {/* SUB-CARD CONTENT */}
                  <div className="sub-card-content">

                    {/* EXERCISE NOTES */}
                    {exercise.notes && (
                      <div className="text-secondary flex items-center gap-1">
                        <StickyNote className="w-3 h-3" />
                        <span>{exercise.notes}</span>
                      </div>
                    )}

                    {/* SETS */}
                    {(() => {
                      const warmupSets = exercise.sets.filter((s) => s.is_warmup);
                      const workingSets = exercise.sets.filter((s) => !s.is_warmup);
                      const unlinkedWarmupTargets = exercise.target
                        ? exercise.target.sets.filter((ts) => ts.is_warmup && !warmupSets.some((s) => s.set_number === ts.set_number))
                        : [];
                      const unlinkedWorkingTargets = exercise.target
                        ? exercise.target.sets.filter((ts) => !ts.is_warmup && !workingSets.some((s) => s.set_number === ts.set_number))
                        : [];
                      const hasContent = exercise.sets.length > 0 || unlinkedWarmupTargets.length > 0 || unlinkedWorkingTargets.length > 0;

                      return !hasContent ? (

                        // NO SETS PLACEHOLDER
                        <p className="text-secondary">No sets recorded</p>
                      ) : (

                        // SETS
                        <div className="flex flex-col gap-1">

                          {/* WARMUP SET ROWS */}
                          {warmupSets.map((set) => {
                            const targetSet = exercise.target
                              ? exercise.target.sets.find((ts) => ts.set_number === set.set_number && ts.is_warmup)
                              : null;
                            const targetDiffers = targetSet && (
                              set.weight !== targetSet.weight || set.reps !== targetSet.reps || set.rpe !== targetSet.rpe
                            );

                            return (
                              // WARMUP SET ROW
                              <p key={set.id} className="text-secondary">
                                <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                                {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                {targetDiffers && <span> · Target: {targetSet.weight} x {targetSet.reps}{targetSet.rpe !== null ? ` @ ${targetSet.rpe}` : ""}</span>}
                              </p>
                            );
                          })}

                          {/* UNLINKED WARMUP TARGET ROWS */}
                          {unlinkedWarmupTargets.map((ts) => (
                            <p key={ts.id} className="text-secondary">
                              <span>Target: {ts.weight > 0 ? `${ts.weight}lb` : "BW"} x {ts.reps}</span>
                              {ts.rpe !== null && <span> @ {ts.rpe}RPE</span>}
                            </p>
                          ))}

                          {/* WORKING SET ROWS */}
                          {workingSets.map((set) => {
                            const targetSet = exercise.target
                              ? exercise.target.sets.find((ts) => ts.set_number === set.set_number && !ts.is_warmup)
                              : null;
                            const targetDiffers = targetSet && (
                              set.weight !== targetSet.weight || set.reps !== targetSet.reps || set.rpe !== targetSet.rpe
                            );

                            return (
                              // WORKING SET ROW
                              <p key={set.id}>
                                <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                                {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                {targetDiffers && <span className="text-secondary"> · Target: {targetSet.weight} x {targetSet.reps}{targetSet.rpe !== null ? ` @ ${targetSet.rpe}` : ""}</span>}
                                {set.notes && <span className="text-secondary"> - {set.notes}</span>}
                              </p>
                            );
                          })}

                          {/* UNLINKED WORKING TARGET ROWS */}
                          {unlinkedWorkingTargets.map((ts) => (
                            <p key={ts.id} className="text-secondary">
                              <span>Target: {ts.weight > 0 ? `${ts.weight}lb` : "BW"} x {ts.reps}</span>
                              {ts.rpe !== null && <span> @ {ts.rpe}RPE</span>}
                            </p>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* UNLINKED TARGET CARDS */}
              {unlinkedTargetExercises.map((target) => (

                // TARGET SUB-CARD
                <div
                  key={target.id}
                  className="sub-card cursor-pointer"
                  onClick={() => handleOpenTargetExercise(target)}
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
                      <div className="flex flex-col gap-1">

                        {/* WARMUP SET ROWS */}
                        {target.sets.filter((s) => s.is_warmup).map((set) => (
                          <p key={set.id} className="text-secondary">
                            <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                            {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                          </p>
                        ))}

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

              {/* ADD EXERCISE BUTTON */}
              <Button
                onClick={handleAddExercise}
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

      {/* EDIT EXERCISE MODAL */}
      <EditExerciseModal
        isOpen={isExerciseModalOpen}
        onClose={() => setIsExerciseModalOpen(false)}
        onSave={handleSaveExercise}
        onRemove={handleRemoveExercise}
        exercise={exerciseModalData}
        exercises={exercises}
        isSaving={isSavingExercise}
      />
    </div>
  );
}
