"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StickyNote, Plus } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";
import SessionNavbar from "./SessionNavbar";
import DeleteSessionModal from "./DeleteSessionModal";
import EditExerciseModal from "./EditExerciseModal";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseWithSets[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // INPUT
  const [editedSessionName, setEditedSessionName] = useState("");
  const [editedSessionNotes, setEditedSessionNotes] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [exerciseModalData, setExerciseModalData] = useState<SessionExerciseWithSets | null>(null);
  const [isSavingExercise, setIsSavingExercise] = useState(false);

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

  // EXERCISE HANDLERS
  const handleOpenExercise = (exercise: SessionExerciseWithSets) => {
    setExerciseModalData(exercise);
    setIsExerciseModalOpen(true);
  };

  const handleAddExercise = () => {
    const exerciseId = crypto.randomUUID();
    const newExercise: SessionExerciseWithSets = {
      id: exerciseId,
      session_id: id,
      exercise_id: "",
      exercise_name: "",
      order_index: sessionExercises.length + 1,
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
    setExerciseModalData(newExercise);
    setIsExerciseModalOpen(true);
  };

  const handleSaveExercise = async (editedExercise: SessionExerciseWithSets) => {
    setIsSavingExercise(true);
    try {
      // Check if exercise already exists in the list
      const existingIndex = sessionExercises.findIndex(ex => ex.id === editedExercise.id);
      let updatedExercises: SessionExerciseWithSets[];

      if (existingIndex >= 0) {
        // Replace existing exercise
        updatedExercises = sessionExercises.map(ex =>
          ex.id === editedExercise.id ? editedExercise : ex
        );
      } else {
        // Add new exercise
        updatedExercises = [...sessionExercises, editedExercise];
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

      const savedExercises = await response.json();
      setSessionExercises(savedExercises);
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
    const exists = sessionExercises.some(ex => ex.id === exerciseModalData.id);
    if (!exists) {
      setIsExerciseModalOpen(false);
      return;
    }

    setIsSavingExercise(true);
    try {
      const updatedExercises = sessionExercises.filter(ex => ex.id !== exerciseModalData.id);
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

      const savedExercises = await response.json();
      setSessionExercises(savedExercises);
      setIsExerciseModalOpen(false);
      toast.success("Exercise removed");
    } catch (error) {
      toast.error("Failed to remove exercise");
      console.error("Error removing exercise:", error);
    } finally {
      setIsSavingExercise(false);
    }
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
          isEditing={isEditingSession}
          isSaving={isSavingSession}
          onBack={() => router.back()}
          onDelete={() => setIsDeleteModalOpen(true)}
          onEdit={handleStartEditSession}
          onCancel={handleCancelEditSession}
          onSave={handleSaveSession}
        />
      )}

      <main className="page-container">

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
              <h2 className="text-card-title">Exercises ({sessionExercises.length})</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {sessionExercises.length === 0 ? (

                // EMPTY STATE
                <p className="table-empty">No exercises recorded for this session</p>
              ) : (

                // EXERCISE SUB-CARDS
                sessionExercises.map((exercise) => (

                  // EXERCISE SUB-CARD
                  <div
                    key={exercise.id}
                    className="sub-card cursor-pointer"
                    onClick={() => handleOpenExercise(exercise)}
                  >

                    {/* SUB-CARD HEADER */}
                    <div className="sub-card-header">

                      {/* EXERCISE NAME */}
                      <h3 className="text-card-title">{exercise.exercise_name}</h3>
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
                      {exercise.sets.length === 0 ? (

                        // NO SETS PLACEHOLDER
                        <p className="text-secondary">No sets recorded</p>
                      ) : (

                        // SET ROWS
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
