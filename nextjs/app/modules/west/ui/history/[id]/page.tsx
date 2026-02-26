"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Dumbbell, Calendar, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../../types/workoutSession";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseWithSets[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchSessionData();
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

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
                <div className="text-secondary">
                  <span>{formatDate(session.session_date)}</span>
                </div>

                {/* EXERCISE COUNT */}
                <div className="text-secondary">
                  <span>{sessionExercises.length} exercises</span>
                </div>

                {/* SESSION NOTES */}
                {session.notes && (
                  <div className="text-secondary">
                    <span>{session.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EXERCISES */}
          {sessionExercises.length === 0 ? (

            // EMPTY STATE
            <div className="card">
              <p className="table-empty">No exercises recorded for this session</p>
            </div>
          ) : (

            // EXERCISE CARDS
            sessionExercises.map((exercise) => (

              // EXERCISE CARD
              <div key={exercise.id} className="card">

                {/* CARD HEADER */}
                <div className="card-header">

                  {/* EXERCISE NAME */}
                  <h3 className="text-card-title">
                    {exercise.exercise_name}
                  </h3>
                </div>

                {/* EXERCISE NOTES */}
                {exercise.notes && (
                  <div className="text-secondary flex items-center gap-1 mb-4">
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
            ))
          )}
        </div>
      </main>
    </div>
  );
}
