"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, StickyNote, Plus, Trash2, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";
import SessionNavbar from "./SessionNavbar";
import DeleteSessionModal from "./DeleteSessionModal";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseWithSets[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // INPUT
  const [editedSessionName, setEditedSessionName] = useState("");
  const [editedSessionNotes, setEditedSessionNotes] = useState("");
  const [editedExercises, setEditedExercises] = useState<SessionExerciseWithSets[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isEditingExercises, setIsEditingExercises] = useState(false);
  const [isSavingExercises, setIsSavingExercises] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // DERIVED
  const displayExercises = isEditingExercises ? editedExercises : sessionExercises;  // Determine which exercises to render
  const isEditing = isEditingSession || isEditingExercises;
  const isSaving = isSavingSession || isSavingExercises;

  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewSession = searchParams.get("new") === "true";

  // LOAD DATA
  useEffect(() => {
    fetchSessionData();
    fetchExercises();
  }, [id]);

  // Initialize edit modes for new sessions
  useEffect(() => {
    if (isNewSession && session && !isLoading) {
      handleStartEditSession();
      handleStartEditExercises();
      handleAddExercise();

      // Clear the query param so refresh doesn't re-trigger
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
        const exercisesData = await exercisesResponse.json();
        setSessionExercises(exercisesData);
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // SESSION INFO HANDLERS
  const handleStartEditSession = () => {
    if (!session) return;
    setEditedSessionName(session.name);
    setEditedSessionNotes(session.notes || "");
    setIsEditingSession(true);
  };

  const handleCancelEditSession = () => {
    setIsEditingSession(false);
    setEditedSessionName("");
    setEditedSessionNotes("");
  };

  const handleSaveSession = async () => {
    if (!editedSessionName.trim()) {
      toast.error("Session name is required");
      return;
    }

    setIsSavingSession(true);
    try {
      const response = await fetch(`/modules/west/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedSessionName.trim(),
          notes: editedSessionNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update session");
        return;
      }

      setIsEditingSession(false);

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

  // EXERCISE HANDLERS
  const handleStartEditExercises = () => {
    // Deep copy exercises for editing
    setEditedExercises(JSON.parse(JSON.stringify(sessionExercises)));
    setIsEditingExercises(true);
  };

  const handleCancelEditExercises = () => {
    setIsEditingExercises(false);
    setEditedExercises([]);
  };

  const handleSaveExercises = async () => {
    const hasUnselectedExercise = editedExercises.some((e) => !e.exercise_id);
    if (hasUnselectedExercise) {
      toast.error("Please select an exercise for all entries");
      return;
    }

    setIsSavingExercises(true);
    try {
      const response = await fetch(`/modules/west/api/sessions/${id}/exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedExercises),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update exercises");
        return;
      }

      setIsEditingExercises(false);
      setEditedExercises([]);

    } catch (error) {
      toast.error("Failed to update exercises");
      console.error("Error saving session exercises:", error);
    } finally {
      setIsSavingExercises(false);
    }
  };

  const handleAddExercise = () => {
    const exerciseId = crypto.randomUUID();
    const newExercise = {
      id: exerciseId,
      session_id: id,
      exercise_id: "",
      exercise_name: "",
      order_index: editedExercises.length + 1,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
      sets: [{
        id: crypto.randomUUID(),
        session_exercise_id: exerciseId,
        set_number: 1,
        reps: 0,
        weight: 0,
        rpe: null,
        notes: null,
        created_at: new Date(),
        modified_at: new Date(),
      }],
    };
    setEditedExercises((prev) => [...prev, newExercise]);
  };

  const handleRemoveExercise = (exerciseIndex: number) => {
    const updated = editedExercises.filter((_, i) => i !== exerciseIndex);
    // Re-number order_index
    updated.forEach((exercise, i) => {
      exercise.order_index = i + 1;
    });
    setEditedExercises(updated);
  };

  const handleAddSet = (exerciseIndex: number) => {
    const exercise = editedExercises[exerciseIndex];
    const newSet = {
      id: crypto.randomUUID(),
      session_exercise_id: exercise.id,
      set_number: exercise.sets.length + 1,
      reps: 0,
      weight: 0,
      rpe: null,
      notes: null,
      created_at: new Date(),
      modified_at: new Date(),
    };

    const updated = [...editedExercises];
    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      sets: [...updated[exerciseIndex].sets, newSet],
    };
    setEditedExercises(updated);
  };

  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    const updated = [...editedExercises];
    const updatedSets = updated[exerciseIndex].sets.filter((_, i) => i !== setIndex);
    // Re-number set_number
    updatedSets.forEach((set, i) => {
      set.set_number = i + 1;
    });
    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      sets: updatedSets,
    };
    setEditedExercises(updated);
  };

  const updateExerciseNotes = (exerciseIndex: number, notes: string) => {
    const updated = [...editedExercises];
    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      notes: notes || null,
    };
    setEditedExercises(updated);
  };

  // When user changes session set group's exercise, this updates the associated exercise
  const updateExerciseId = (exerciseIndex: number, exerciseId: string) => {
    const selectedExercise = exercises.find((e) => e.id === exerciseId);
    if (!selectedExercise) return;

    const updated = [...editedExercises];
    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      exercise_id: exerciseId,
      exercise_name: selectedExercise.name,
    };
    setEditedExercises(updated);
  };

  const updateSetField = (exerciseIndex: number, setIndex: number, field: string, value: string) => {
    const updated = [...editedExercises];
    const set = { ...updated[exerciseIndex].sets[setIndex] };

    if (field === "weight") {
      set.weight = parseFloat(value) || 0;
    } else if (field === "reps") {
      set.reps = parseInt(value) || 0;
    } else if (field === "rpe") {
      set.rpe = value === "" ? null : parseFloat(value) || null;
    } else if (field === "notes") {
      set.notes = value || null;
    }

    updated[exerciseIndex] = {
      ...updated[exerciseIndex],
      sets: [
        ...updated[exerciseIndex].sets.slice(0, setIndex),
        set,
        ...updated[exerciseIndex].sets.slice(setIndex + 1),
      ],
    };
    setEditedExercises(updated);
  };

  // NAVBAR HANDLERS
  const handleEdit = () => {
    handleStartEditSession();
    handleStartEditExercises();
  };

  const handleCancel = () => {
    handleCancelEditSession();
    handleCancelEditExercises();
  };

  const handleSave = async () => {
    await handleSaveSession();
    await handleSaveExercises();
    toast.success("Session saved");
    fetchSessionData();
  };

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

      {/* SESSION NAVBAR */}
      {session && (
        <SessionNavbar
          isEditing={isEditing}
          isSaving={isSaving}
          onDelete={() => setIsDeleteModalOpen(true)}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      )}

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-4">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.back()}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

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

                    {/* DATE (READ-ONLY) */}
                    <div>
                      <label className="text-secondary">Date</label>
                      <p className="text-primary">{formatDate(session.session_date)}</p>
                    </div>

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

                    {/* DATE */}
                    <div>
                      <label className="text-secondary">Date</label>
                      <p className="text-primary">{formatDate(session.session_date)}</p>
                    </div>

                    {/* EXERCISE COUNT */}
                    <div>
                      <label className="text-secondary">Exercises</label>
                      <p className="text-primary">{sessionExercises.length}</p>
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
              <h2 className="text-card-title">Exercises ({displayExercises.length})</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {displayExercises.length === 0 ? (

                // EMPTY STATE
                <p className="table-empty">No exercises recorded for this session</p>
              ) : (

                // EXERCISE SUB-CARDS
                displayExercises.map((exercise, exerciseIndex) => (

                  // EXERCISE SUB-CARD
                  <div key={exercise.id} className="sub-card">

                    {/* SUB-CARD HEADER */}
                    <div className="sub-card-header">

                      {/* EXERCISE NAME */}
                      {isEditingExercises ? (
                        <div className="flex items-center gap-2 flex-1">

                          {/* EXERCISE DROPDOWN */}
                          <select
                            value={exercise.exercise_id}
                            onChange={(e) => updateExerciseId(exerciseIndex, e.target.value)}
                            className="input-field flex-1"
                          >
                            <option value="" disabled>Select an exercise...</option>
                            {exercises.map((ex) => (
                              <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                          </select>

                          {/* REMOVE EXERCISE BUTTON */}
                          <Button
                            onClick={() => handleRemoveExercise(exerciseIndex)}
                            className="btn-link btn-link-delete !p-2"
                            title="Remove exercise"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <h3 className="text-card-title">
                          {exercise.exercise_name}
                        </h3>
                      )}
                    </div>

                    {/* SUB-CARD CONTENT */}
                    <div className="sub-card-content">

                      {/* EXERCISE NOTES */}
                      {isEditingExercises ? (

                        // EDITABLE EXERCISE NOTES
                        <div className="mr-10">
                          <label className="text-secondary">Notes</label>
                          <input
                            type="text"
                            placeholder="Exercise notes..."
                            value={exercise.notes || ""}
                            onChange={(e) => updateExerciseNotes(exerciseIndex, e.target.value)}
                            className="input-field"
                          />
                        </div>
                      ) : (
                        exercise.notes && (
                          <div className="text-secondary flex items-center gap-1">
                            <StickyNote className="w-3 h-3" />
                            <span>{exercise.notes}</span>
                          </div>
                        )
                      )}

                      {/* SETS */}
                      {isEditingExercises ? (

                        // EDITABLE SET ROWS
                        <div className="space-y-4">
                          {exercise.sets.map((set, setIndex) => (

                            // EDITABLE SET ROW
                            <div key={set.id} className="flex items-center gap-2">

                              {/* WEIGHT INPUT */}
                              <div className="flex flex-col">
                                <label className="text-secondary">Weight</label>
                                <input
                                  type="number"
                                  value={set.weight}
                                  onChange={(e) => updateSetField(exerciseIndex, setIndex, "weight", e.target.value)}
                                  className="input-field !max-w-10 text-center"
                                  step="0.5"
                                  min="0"
                                />
                              </div>
                              <span className="text-secondary mt-5">x</span>

                              {/* REPS INPUT */}
                              <div className="flex flex-col">
                                <label className="text-secondary">Reps</label>
                                <input
                                  type="number"
                                  value={set.reps}
                                  onChange={(e) => updateSetField(exerciseIndex, setIndex, "reps", e.target.value)}
                                  className="input-field !max-w-10 text-center"
                                  min="0"
                                />
                              </div>
                              <span className="text-secondary mt-5">@</span>

                              {/* RPE INPUT */}
                              <div className="flex flex-col">
                                <label className="text-secondary">RPE</label>
                                <input
                                  type="number"
                                  value={set.rpe ?? ""}
                                  onChange={(e) => updateSetField(exerciseIndex, setIndex, "rpe", e.target.value)}
                                  className="input-field !max-w-10 text-center"
                                  placeholder="-"
                                  step="0.5"
                                  min="1"
                                  max="10"
                                />
                              </div>
                              <span className="text-secondary mt-5">-</span>

                              {/* SET NOTES INPUT */}
                              <div className="flex flex-col flex-1">
                                <label className="text-secondary">Notes</label>
                                <input
                                  type="text"
                                  value={set.notes || ""}
                                  onChange={(e) => updateSetField(exerciseIndex, setIndex, "notes", e.target.value)}
                                  className="input-field"
                                  placeholder="-"
                                />
                              </div>

                              {/* REMOVE SET BUTTON */}
                              <Button
                                onClick={() => handleRemoveSet(exerciseIndex, setIndex)}
                                className="btn-link btn-link-delete mt-5"
                                title="Remove set"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}

                          {/* ADD SET BUTTON */}
                          <Button
                            onClick={() => handleAddSet(exerciseIndex)}
                            className="btn-link"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Set</span>
                          </Button>
                        </div>
                      ) : exercise.sets.length === 0 ? (

                        // NO SETS PLACEHOLDER
                        <p className="text-secondary">No sets recorded</p>
                      ) : (

                        // READ-ONLY SET ROWS
                        <div className="flex flex-col gap-1">
                          {exercise.sets.map((set) => (

                            // SET ROW
                            <p key={set.id}>
                              <span>{set.weight > 0 ? `${set.weight}lb` : "BW"} x {set.reps}</span>
                              {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                              {set.notes && <span className="text-secondary"> - {set.notes}</span>}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* ADD EXERCISE BUTTON */}
              {isEditingExercises && (
                <Button
                  onClick={handleAddExercise}
                  className="btn-link"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Exercise</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* DELETE SESSION MODAL */}
      <DeleteSessionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSession}
        sessionName={session?.name || ""}
        isDeleting={isDeletingSession}
      />
    </div>
  );
}
