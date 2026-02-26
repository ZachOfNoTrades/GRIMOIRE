"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../types/exercise";

export default function ExercisesPage() {

  // DATA
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // UI
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchExercises();
  }, []);

  // UPDATE SEARCH FILTER
  useEffect(() => {
    filterExercises();
  }, [exercises, searchTerm]);

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/modules/west/api/exercises");
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

  const filterExercises = () => {
    let filtered = [...exercises];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((exercise) =>
        exercise.name.toLowerCase().includes(term)
      );
    }

    setFilteredExercises(filtered);
  };

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.back()}
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

            {/* SEARCH BAR */}
            <div>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          {/* TABLE */}
          {isLoading ? (

            // LOADING PLACEHOLDER
            <p className="text-page-subtitle text-center py-8">Loading exercises...</p>
          ) : (

            // CONTENT
            <div className="table-container max-h-[calc(100vh-28rem)]">
              <table className="table">

                {/* TABLE HEADERS */}
                <thead className="table-header">
                  <tr className="table-header-row">
                    <th className="table-header-cell">Exercise</th>
                  </tr>
                </thead>

                {/* TABLE ROWS */}
                <tbody className="table-body">

                  {exercises.length === 0 ? (

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
                      <tr key={exercise.id} className="table-row">
                        <td className="table-cell">{exercise.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUMMARY */}
          {!isLoading && filteredExercises.length > 0 && (
            <div className="text-secondary text-center mt-4">
              Showing {filteredExercises.length} of {exercises.length} exercises
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
