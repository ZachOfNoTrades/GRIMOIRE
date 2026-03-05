"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../types/exercise";
import AddExerciseModal from "./AddExerciseModal";

export default function ExercisesPage() {

  // DATA
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const statusExercises = exercises.filter((exercise) =>
    showDisabled ? exercise.is_disabled : !exercise.is_disabled
  );
  const filteredExercises = statusExercises.filter((exercise) =>
    !searchTerm || exercise.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/modules/west/api/exercises?includeDisabled=true");
      if (!response.ok) {
        throw new Error("Failed to fetch exercises");
      }
      const data = await response.json();
      setExercises(data);
    } catch (error) {
      console.error("Error fetching exercises:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/west/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE/SUBTITLE */}
          <div>
            <h1 className="text-page-title">Exercise Library</h1>
          </div>
        </div>

        {/* EXERCISES CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <h2 className="text-card-title">
              <Dumbbell className="w-5 h-5" />
              Exercises
            </h2>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">

              {/* SEARCH BAR */}
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />

              {/* ADD BUTTON */}
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </Button>
            </div>
          </div>

          {/* STATUS FILTER TABS */}
          <div className="flex gap-0 border-b border-[var(--card-border)]">

            {/* ENABLED TAB */}
            <button
              onClick={() => setShowDisabled(false)}
              className={`tab-button ${!showDisabled ? "tab-button-active" : ""}`}
            >
              Enabled
            </button>

            {/* DISABLED TAB */}
            <button
              onClick={() => setShowDisabled(true)}
              className={`tab-button ${showDisabled ? "tab-button-active" : ""}`}
            >
              Disabled
            </button>
          </div>

          {/* TABLE */}
          <div className="table-container min-h-[15rem] max-h-[calc(100vh-28rem)]">
            <table className="table">

              {/* TABLE HEADERS */}
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Exercise</th>
                </tr>
              </thead>

              {/* TABLE ROWS */}
              <tbody className="table-body">

                {isLoading ? (

                  // LOADING PLACEHOLDER
                  <tr>
                    <td className="table-empty">
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                ) : exercises.length === 0 ? (

                  // NO RECORDS FOUND WARNING
                  <tr>
                    <td className="table-empty">No exercises found</td>
                  </tr>
                ) : filteredExercises.length === 0 ? (

                  // NO SEARCH RESULTS FOUND WARNING
                  <tr>
                    <td className="table-empty">No exercises match search criteria</td>
                  </tr>
                ) : (

                  // RECORDS MAP
                  filteredExercises.map((exercise) => (

                    // TABLE ROW
                    <tr
                      key={exercise.id}
                      className="table-row-clickable"
                      onClick={() => router.push(`/modules/west/ui/exercises/${exercise.id}`)}
                    >
                      <td className="table-cell">{exercise.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* SUMMARY */}
          {!isLoading && statusExercises.length > 0 && (
            <div className="text-secondary text-center mt-4">
              Showing {filteredExercises.length} of {statusExercises.length} {showDisabled ? "disabled" : "enabled"} exercises
            </div>
          )}
        </div>

        {/* ADD EXERCISE MODAL */}
        <AddExerciseModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSaved={fetchExercises}
        />
      </main>
    </div>
  );
}
