"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Save, StickyNote, Plus } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseWithSets[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // INPUT
  const [editedExercises, setEditedExercises] = useState<SessionExerciseWithSets[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchSessionData();
    fetchExercises();
  }, [id]);

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

  const handleStartEdit = () => {
    // Deep copy exercises for editing
    setEditedExercises(JSON.parse(JSON.stringify(sessionExercises)));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedExercises([]);
  };

  const handleSaveEdit = async () => {
    const hasUnselectedExercise = editedExercises.some((e) => !e.exercise_id);
    if (hasUnselectedExercise) {
      toast.error("Please select an exercise for all entries");
      return;
    }

    setIsSaving(true);
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

      toast.success("Exercises updated successfully");
      setIsEditing(false);
      setEditedExercises([]);
      fetchSessionData();

    } catch (error) {
      toast.error("Failed to update exercises");
      console.error("Error saving session exercises:", error);
    } finally {
      setIsSaving(false);
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

  // Determine which exercises to render
  const displayExercises = isEditing ? editedExercises : sessionExercises;

  return (

    // BACKGROUND
    <div className="page">

      <Toaster />

      <main className="page-container">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <div>

            {/* BACK BUTTON */}
            <Button
              onClick={() => router.push("/modules/west/ui/history")}
              className="btn-link !pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>

            {/* TITLE */}
            <h1 className="text-page-title">{session ? session.name : "Session Not Found"}</h1>
          </div>

          {/* VIEW MODE ACTION GROUP */}
          {!isEditing && session && (
            <Button
              onClick={handleStartEdit}
              className="btn-primary !p-3"
              title="Edit exercises"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          )}

          {/* EDIT MODE ACTION GROUP */}
          {isEditing && (
            <div className="flex items-center space-x-2">

              {/* CANCEL BUTTON */}
              <Button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="btn-link"
              >
                <span>Cancel</span>
              </Button>

              {/* SAVE BUTTON */}
              <Button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="btn-success"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </Button>
            </div>
          )}
        </div>

        {/* CARDS */}
        <div className="card-container">

          {/* SESSION INFO CARD */}
          {session && (
            <div className="card">

              {/* CARD HEADER */}
              <div className="card-header">
                <h2 className="text-card-title">Session Info</h2>
              </div>

              {/* CARD CONTENT */}
              <div className="card-content">

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
              </div>
            </div>
          )}

          {/* EXERCISES */}
          {displayExercises.length === 0 ? (

            // EMPTY STATE
            <div className="card">
              <p className="table-empty">No exercises recorded for this session</p>
            </div>
          ) : (

            // EXERCISE CARDS
            displayExercises.map((exercise, exerciseIndex) => (

              // EXERCISE CARD
              <div key={exercise.id} className="card">

                {/* CARD HEADER */}
                <div className="card-header">

                  {/* EXERCISE NAME */}
                  {isEditing ? (
                    <select
                      value={exercise.exercise_id}
                      onChange={(e) => updateExerciseId(exerciseIndex, e.target.value)}
                      className="input-field"
                    >
                      <option value="" disabled>Select an exercise...</option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>{ex.name}</option>
                      ))}
                    </select>
                  ) : (
                    <h3 className="text-card-title">
                      {exercise.exercise_name}
                    </h3>
                  )}
                </div>

                {/* EXERCISE NOTES */}
                {isEditing ? (

                  // EDITABLE EXERCISE NOTES
                  <div className="mb-4">
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
                    <div className="text-secondary flex items-center gap-1 mb-4">
                      <StickyNote className="w-3 h-3" />
                      <span>{exercise.notes}</span>
                    </div>
                  )
                )}

                {/* SETS */}
                {isEditing ? (

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
            ))
          )}

          {/* ADD EXERCISE BUTTON */}
          {isEditing && (
            <Button
              onClick={handleAddExercise}
              className="btn-link"
            >
              <Plus className="w-4 h-4" />
              <span>Add Exercise</span>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
